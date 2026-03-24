// server.js
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const locations = require("./data/locations.json");
const { haversineDistance, getWeekNumber, getTimeSlotForDate } = require("./utils/helpers");
const { getScheduleFromIcs } = require("./utils/ics");
const { createScheduleCache } = require("./utils/scheduleCache");

const app = express();
const PORT = 3000;
const SCHEDULE_REFRESH_MINUTES = Math.max(5, parseInt(process.env.SCHEDULE_REFRESH_MINUTES || "120", 10));
const SCHEDULE_FETCH_CONCURRENCY = Math.max(1, parseInt(process.env.SCHEDULE_FETCH_CONCURRENCY || "8", 10));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function loadAllRooms() {
  const dataDir = path.join(__dirname, "data");
  const roomFiles = fs.readdirSync(dataDir).filter((file) => file.endsWith("_rooms.txt"));

  const rooms = [];
  for (const file of roomFiles) {
    const buildingName = file.replace("_rooms.txt", "").replace(/_/g, "");
    const roomNames = fs.readFileSync(path.join(dataDir, file), "utf-8").split("\n").filter(Boolean);
    const building = locations.find((loc) => loc.building.toLowerCase().replace(" ", "").includes(buildingName.toLowerCase()));

    if (!building) {
      continue;
    }

    rooms.push(
      ...roomNames.map((room) => ({
        name: room,
        building: building.building,
        lat: building.lat,
        lon: building.lon,
        id: building.id,
      })),
    );
  }

  return rooms;
}

const allRooms = loadAllRooms();
const scheduleCache = createScheduleCache({
  ttlMs: SCHEDULE_REFRESH_MINUTES * 60 * 1000,
  concurrency: SCHEDULE_FETCH_CONCURRENCY,
});

async function refreshCurrentDaySchedules() {
  const now = new Date();
  const week = getWeekNumber(now);
  const day = now.toLocaleDateString("en-US", { weekday: "short" });
  const result = await scheduleCache.refreshAll(allRooms, week, day);
  console.log(`Schedule cache refreshed for week ${result.week}, ${result.day}: ${result.roomCount} rooms in ${result.durationMs}ms`);
}

// Configure middleware
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(bodyParser.urlencoded({ extended: true }));

// --- ROUTES ---

// Render the main page with the form
app.get("/", (req, res) => {
  res.render("index", { locations });
});

// Handle the form submission and find rooms
app.post("/find", upload.single("timetable"), async (req, res) => {
  try {
    // const { lastClass: lastClassId, nextClass: nextClassId } = req.body;
    const { lastClass: lastClassId, nextClass: nextClassId, latitude, longitude, timeSlot: selectedTimeSlot } = req.body;

    let startPoint;
    let lastClassLocation = null;
    let nextClassLocation = null;
    const now = new Date();
    let scheduleTime = now;

    if (req.file && req.file.buffer && req.file.buffer.length > 0) {
      const icsText = req.file.buffer.toString("utf-8");
      const inferred = getScheduleFromIcs(icsText, now, locations);
      if (inferred.error) {
        return res.status(400).send(inferred.error);
      }
      lastClassLocation = inferred.lastLocation;
      nextClassLocation = inferred.nextLocation;
      if (inferred.referenceTime instanceof Date && !Number.isNaN(inferred.referenceTime.valueOf())) {
        scheduleTime = inferred.referenceTime;
      }
    }

    // Check if GPS coordinates were provided
    if (latitude && longitude) {
      console.log("Using current GPS location as starting point.");
      startPoint = { lat: parseFloat(latitude), lon: parseFloat(longitude) };
    } else {
      console.log("Using last class location as starting point.");
      if (!lastClassLocation && lastClassId) {
        lastClassLocation = locations.find((loc) => loc.id === lastClassId);
      }
      startPoint = lastClassLocation;
    }

    // Check if we have a valid starting point
    if (!startPoint) {
      return res.status(400).send("Error: A starting point could not be determined. Please try again.");
    }

    // const nextClassLocation = locations.find(loc => loc.id === nextClassId);

    // 1. Get current date/time info
    const week = getWeekNumber(scheduleTime);
    // const day = now.toLocaleDateString('en-US', {weekday : 'long'}); // e.g., "Thursday"
    const day = scheduleTime.toLocaleDateString("en-US", { weekday: "short" }); // e.g., "Thu"

    // Determine timeslot: use selected timeslot or derive from current time
    let timeSlot;
    if (selectedTimeSlot && selectedTimeSlot.match(/^\d{2}:\d{2}$/)) {
      const hour = parseInt(selectedTimeSlot.split(":")[0], 10);
      const startTime = selectedTimeSlot;
      const endTime = `${String(hour + 1).padStart(2, "0")}:00`;
      timeSlot = { start: startTime, end: endTime };
    } else {
      timeSlot = getTimeSlotForDate(scheduleTime);
    }

    if (!timeSlot) {
      return res.status(400).send("App can only be used between 08:00 and 17:00.");
    }

    // 2. Fetch schedules from cache (cold entries are fetched on demand)
    const schedules = await scheduleCache.getSchedulesForRooms(allRooms, week, day);

    // 3. Filter for available rooms
    const availableRooms = allRooms.filter((room, index) => {
      const roomSchedule = schedules[index];
      return !roomSchedule.includes(timeSlot.start);
    });

    // 4. Find the location objects for the start and end points
    if (!nextClassLocation && nextClassId) {
      nextClassLocation = locations.find((loc) => loc.id === nextClassId);
    }

    if (!nextClassLocation) {
      return res.status(400).send("Error: A next class location could not be determined. Please upload a timetable or select a next class.");
    }

    // 5. Rank available rooms by distance
    // const rankedRooms =
    //     availableRooms
    //         .map(room => {
    //             const dist1 = haversineDistance(lastClassLocation, room); // last class -> empty room
    //             const dist2 = haversineDistance(room, nextClassLocation); // empty room -> next class
    //             const totalDistance = dist1 + dist2;
    //             return {...room, totalDistance};
    //         })
    //         .sort((a, b) => a.totalDistance - b.totalDistance); // Sort by shortest total distance

    // 5. Rank available rooms by distance
    const rankedRooms = availableRooms
      .map((room) => {
        // Use the dynamically determined 'startPoint'
        const dist1 = haversineDistance(startPoint, room);
        const dist2 = haversineDistance(room, nextClassLocation);
        const totalDistance = dist1 + dist2;
        return { ...room, totalDistance };
      })
      .sort((a, b) => a.totalDistance - b.totalDistance);

    // 6. Render the results
    res.render("results", { rooms: rankedRooms, timeSlot });
    // console.log(rankedRooms);
  } catch (error) {
    console.error("Error in /find route:", error);
    res.status(500).send("An error occurred while finding a room.");
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);

  refreshCurrentDaySchedules().catch((error) => {
    console.error("Initial schedule cache refresh failed:", error);
  });

  const refreshTimer = setInterval(
    () => {
      refreshCurrentDaySchedules().catch((error) => {
        console.error("Scheduled cache refresh failed:", error);
      });
    },
    SCHEDULE_REFRESH_MINUTES * 60 * 1000,
  );

  if (typeof refreshTimer.unref === "function") {
    refreshTimer.unref();
  }
});
