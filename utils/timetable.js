// utils/timetable.js
const fetch = require('node-fetch');
const {JSDOM} = require('jsdom');
const fs = require('fs');
const path = require('path');

/**
 * Fetches and parses a room's schedule.
 * @param {string} roomName - The name of the room (e.g., "A202 NARGA").
 * @param {number} week - The week number.
 * @param {string} day - The day of the week (e.g., "Thursday").
 * @returns {Promise<Array<string>>} A promise that resolves to an array of booked start times (e.g., ["08:00",
 *     "14:00"]).
 */
async function getRoomSchedule(roomName, week, day)
{
    // 1. Read the base URL from the file
    const baseUrlPath = path.join(__dirname, 'url.txt');
    const baseUrlTemplate = fs.readFileSync(baseUrlPath, 'utf-8');

    // 2. Dynamically create the URL
    const url = baseUrlTemplate.replace("Jan%20Mouton%20(El.Class)_2015", encodeURIComponent(roomName))
                    .replace("weeks=32", `weeks=${week}`);

    // console.log(`Fetching schedule for ${roomName} on ${day} from ${url}`);

    try
    {
        const response = await fetch(url);
        const text = await response.text();
        const dom = new JSDOM(text);
        const doc = dom.window.document;

        const tbl = doc.getElementsByClassName("grid-border-args")[0];
        if (!tbl)
        {
            // console.warn(`No schedule table found for ${roomName}`);
            return []; // Return empty schedule if table not found
        }

        const trs = tbl.querySelector("tbody").children;
        const headerRow = trs[0].getElementsByTagName("td");

        // Find the column index for the correct day
        let dayColumnIndex = -1;
        for (let i = 0; i < headerRow.length; i++)
        {
            if (headerRow[i].textContent.trim().toLowerCase() === day.toLowerCase())
            {
                dayColumnIndex = i;
                break;
            }
        }

        if (dayColumnIndex === -1)
        {
            // console.warn(`Day ${day} not found in schedule for ${roomName}`);
            return [];
        }

        const bookedSlots = [];
        // Iterate through rows (time slots), starting from the second row
        for (let i = 1; i < trs.length; i++)
        {
            const cells = trs[i].children;
            const timeCell = cells[0];
            const activityCell = cells[dayColumnIndex];

            // Check if the cell for the current day indicates a booking
            if (activityCell && activityCell.classList.contains('object-cell-border'))
            {
                const time = timeCell.textContent.trim().split('-')[0]; // Get start time, e.g., "08:00"
                bookedSlots.push(time);
            }
        }
        return bookedSlots;
    }
    catch (error)
    {
        console.error(`Error fetching schedule for ${roomName}:`, error);
        return []; // Return an empty array on error
    }
}

module.exports = {getRoomSchedule};
