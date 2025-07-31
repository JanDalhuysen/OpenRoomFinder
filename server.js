// server.js
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const locations = require('./data/locations.json');
const { getRoomSchedule } = require('./utils/timetable');
const { haversineDistance, getWeekNumber, getCurrentTimeSlot } = require('./utils/helpers');

const app = express();
const PORT = 3000;

// Configure middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({ extended: true }));

// --- ROUTES ---

// Render the main page with the form
app.get('/', (req, res) => {
  res.render('index', { locations });
});

// Handle the form submission and find rooms
app.post('/find', async (req, res) => {
  try {
    const { lastClass: lastClassId, nextClass: nextClassId } = req.body;

    // 1. Get current date/time info
    const now = new Date();
    const week = getWeekNumber(now);
    const day = now.toLocaleDateString('en-US', { weekday: 'long' }); // e.g., "Thursday"
    const timeSlot = getCurrentTimeSlot();

    if (!timeSlot) {
      return res.status(400).send("App can only be used between 08:00 and 17:00.");
    }

    // 2. Fetch all schedules concurrently
    console.log(`Fetching schedules for ${day}, week ${week}, slot ${timeSlot.start}...`);
    const schedulePromises = locations.map(loc => getRoomSchedule(loc.name, week, day));
    const schedules = await Promise.all(schedulePromises);
    console.log('Schedules fetched.');

    // 3. Filter for available rooms
    const availableRooms = locations.filter((location, index) => {
      const roomSchedule = schedules[index];
      // A room is available if its schedule does NOT include the current time slot's start time
      return !roomSchedule.includes(timeSlot.start);
    });

    // 4. Find the location objects for the start and end points
    const lastClassLocation = locations.find(loc => loc.id === lastClassId);
    const nextClassLocation = locations.find(loc => loc.id === nextClassId);

    // 5. Rank available rooms by distance
    const rankedRooms = availableRooms
      .map(room => {
        const dist1 = haversineDistance(lastClassLocation, room); // last class -> empty room
        const dist2 = haversineDistance(room, nextClassLocation); // empty room -> next class
        const totalDistance = dist1 + dist2;
        return { ...room, totalDistance };
      })
      .sort((a, b) => a.totalDistance - b.totalDistance); // Sort by shortest total distance

    // 6. Render the results
    res.render('results', { rooms: rankedRooms, timeSlot });

  } catch (error) {
    console.error("Error in /find route:", error);
    res.status(500).send("An error occurred while finding a room.");
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server is running at http://localhost:${PORT}`);
});
