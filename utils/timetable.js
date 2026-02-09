// utils/timetable.js
const fetch = require("node-fetch");
const { JSDOM } = require("jsdom");

/**
 * Constructs the correct URL for the Stellenbosch University timetable system.
 * @param {string} roomName - The name of the room (e.g., "Jan Mouton 1013").
 * @param {number} week - The week number.
 * @returns {string} The formatted URL for fetching the timetable.
 */
function constructTleUrl(roomName, week) {
  const baseUrl = "https://splus.sun.ac.za:8080/Reporting/individual";
  const baseEngineeringUrl = "https://splus.sun.ac.za:8081/Reporting/individual";

  // The server expects a non-standard URL encoding for the identifier.
  // For example, "Jan Mouton 1013" must become "Jan+Mouton_1013".
  // We replace spaces with '+' and then replace the last '+' before the room number with '_'.
  // const identifier = roomName.replace(/ /g, '+').replace(/\+([^\+]*)$/, '_$1');
  const identifier = roomName;

  // We use URLSearchParams to safely build the query string, though the identifier is already custom-formatted.
  const params = new URLSearchParams({
    idtype: "name",
    objectclass: "location",
    template: "su+location+individual_eng",
    identifier: identifier, // Use the custom-formatted identifier
    weeks: week,
  });

  // Note: URLSearchParams encodes '+' as '%2B', but the server handles it.
  // To be perfectly aligned with the observed URL, we could manually build the string,
  // but this is generally safer. Let's stick to the direct string concatenation
  // to ensure it matches the required format exactly.

  // Special handling for engineering building rooms, which seem to be on a different port
  if (roomName.toLowerCase().includes("engrg")) {
    return `${baseEngineeringUrl}?idtype=name&objectclass=location&template=su%2Blocation%2Bindividual_eng&identifier=${roomName}&weeks=${week}`;
  }

  return `${baseUrl}?idtype=name&objectclass=location&template=su%2Blocation%2Bindividual_eng&identifier=${identifier}&weeks=${week}`;
}

/**
 * Fetches and parses a room's schedule from an HTML timetable.
 * This function correctly handles cells that span multiple rows (rowspan).
 * @param {string} roomName - The name of the room (e.g., "Jan Mouton 1013").
 * @param {number} week - The week number to check.
 * @param {string} day - The day of the week (e.g., "Wednesday").
 * @returns {Promise<Array<string>>} A promise that resolves to an array of all booked 15-minute time slots (e.g., ["08:00", "08:15", "14:00"]).
 */
async function getRoomSchedule(roomName, week, day) {
  // 1. Dynamically create the URL for the specific room and week
  const url = constructTleUrl(roomName, week);

  // console.log(`Fetching schedule for ${roomName} on ${day} from ${url}`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch schedule: ${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    const dom = new JSDOM(text);
    const doc = dom.window.document;

    const tbl = doc.querySelector(".grid-border-args");
    if (!tbl) {
      console.warn(`No schedule table found for ${roomName}. The room might not exist or the page structure has changed.`);
      return []; // Return empty schedule if table not found
    }

    // --- Grid parsing logic to handle rowspans and colspans ---
    const rows = tbl.querySelectorAll("tr");
    const grid = [];

    // Initialize grid with empty arrays for each row
    for (let i = 0; i < rows.length; i++) {
      grid.push([]);
    }

    // Populate the grid, correctly placing cells based on their spans
    for (let i = 0; i < rows.length; i++) {
      let gridCol = 0;
      const cells = rows[i].querySelectorAll("td, th"); // Include th for headers
      for (let j = 0; j < cells.length; j++) {
        while (grid[i][gridCol]) {
          gridCol++; // Skip cells already occupied by a rowspan
        }

        const cell = cells[j];
        const rowspan = parseInt(cell.getAttribute("rowspan") || "1", 10);
        const colspan = parseInt(cell.getAttribute("colspan") || "1", 10);

        // Place the cell and mark all spanned cells as 'occupied'
        for (let r = 0; r < rowspan; r++) {
          for (let c = 0; c < colspan; c++) {
            if (!grid[i + r]) {
              // Ensure row exists
              grid[i + r] = [];
            }
            if (r === 0 && c === 0) {
              grid[i + r][gridCol + c] = cell;
            } else {
              grid[i + r][gridCol + c] = "occupied";
            }
          }
        }
        gridCol += colspan;
      }
    }
    // --- End of grid parsing logic ---

    // Find the column index for the requested day from our virtual grid
    const headerRow = grid[0];
    let dayColumnIndex = -1;
    // The days are Mon, Tue, Wed, Thu, Fri, Sat, Sun
    const daysOfWeek = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    const requestedDayShort = day.toLowerCase().substring(0, 3);

    for (let i = 1; i < headerRow.length; i++) {
      // Start from 1 to skip time column
      if (headerRow[i] && typeof headerRow[i] !== "string" && headerRow[i].textContent.trim().toLowerCase().startsWith(requestedDayShort)) {
        dayColumnIndex = i;
        break;
      }
    }

    if (dayColumnIndex === -1) {
      console.warn(`Day '${day}' not found in schedule for ${roomName}`);
      return [];
    }

    const bookedSlots = [];
    // Iterate through the grid rows (time slots) to find bookings
    for (let i = 1; i < grid.length; i++) {
      // Start from 1 to skip header
      if (!grid[i] || grid[i].length === 0) continue; // Skip empty or malformed rows

      const timeCell = grid[i][0];
      const activityCell = grid[i][dayColumnIndex];

      if (!timeCell || typeof timeCell === "string" || !activityCell) continue; // Skip malformed rows

      const time = timeCell.textContent.trim();
      if (!/^\d{1,2}:\d{2}$/.test(time)) continue; // Ensure it's a valid time cell

      // A cell is booked if it's the start of a booking ('object-cell-border')
      // or if it's 'occupied' by a rowspan from a previous cell.
      if (activityCell === "occupied" || (typeof activityCell !== "string" && activityCell.classList.contains("object-cell-border"))) {
        bookedSlots.push(time);
      }
    }
    // console.log(`Booked slots for ${roomName} on ${day}:`, bookedSlots);
    return bookedSlots;
  } catch (error) {
    console.error(`Error fetching or parsing schedule for ${roomName}:`, error);
    return []; // Return an empty array on error
  }
}

/**
 * Checks if a room is open at a specific time.
 * @param {string} roomName - The name of the room (e.g., "Jan Mouton 1013").
 * @param {number} week - The week number to check.
 * @param {string} day - The day of the week (e.g., "Wednesday").
 * @param {string} time - The time to check in "HH:MM" format (e.g., "09:05").
 * @returns {Promise<boolean>} A promise that resolves to true if the room is open, false otherwise.
 */
async function isRoomOpen(roomName, week, day, time) {
  try {
    // Calculate the 15-minute time slot the requested time falls into.
    const [hour, minute] = time.split(":").map(Number);
    const slotMinute = Math.floor(minute / 15) * 15;
    const timeSlotToCheck = `${String(hour).padStart(2, "0")}:${String(slotMinute).padStart(2, "0")}`;

    const bookedSlots = await getRoomSchedule(roomName, week, day);

    if (bookedSlots.length === 0) {
      return true; // No bookings means it's open all day.
    }

    // The room is open if the specific time slot is NOT in the list of booked slots.
    const isOpen = !bookedSlots.includes(timeSlotToCheck);
    console.log(`Checking if ${roomName} is open on ${day} at ${time} (slot: ${timeSlotToCheck})... Is open: ${isOpen}`);
    return isOpen;
  } catch (error) {
    console.error(`Error checking if room ${roomName} is open:`, error);
    return false; // Assume not open if there's an error
  }
}

module.exports = { getRoomSchedule, isRoomOpen };

// Example Usage (can be uncommented for testing in a Node.js environment)

/*
async function test() {
    const room = "Jan+Mouton_1020";
    const week = 31; // As seen in the sample HTML file
    const day = "fri";

    console.log(`--- Checking schedule for ${room} on a ${day} ---`);

    // Test a booked time
    let isOpen = await isRoomOpen(room, week, day, "10:10");
    console.log(`Is ${room} open at 10:10 on ${day}? ${isOpen}`); // Expected: false

    // Test an open time
    isOpen = await isRoomOpen(room, week, day, "13:05");
    console.log(`Is ${room} open at 13:05 on ${day}? ${isOpen}`); // Expected: true

    // Test another booked time
    isOpen = await isRoomOpen(room, week, day, "14:30");
    console.log(`Is ${room} open at 14:30 on ${day}? ${isOpen}`); // Expected: false
}

test();
*/
