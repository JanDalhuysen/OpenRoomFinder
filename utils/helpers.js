// utils/helpers.js

/**
 * Calculates the distance between two GPS coordinates in kilometers.
 */
function haversineDistance(coords1, coords2)
{
    function toRad(x)
    {
        return x * Math.PI / 180;
    }

    const R = 6371; // Earth's radius in km
    const dLat = toRad(coords2.lat - coords1.lat);
    const dLon = toRad(coords2.lon - coords1.lon);
    const lat1 = toRad(coords1.lat);
    const lat2 = toRad(coords2.lat);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Gets the current week number of the year.
 * Note: Stellenbosch University may have a specific academic week number.
 * For this demo, we use the standard ISO week number.
 */
function getWeekNumber(d)
{
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}

/**
 * Maps the current time to a university time slot.
 * Assumes hourly slots from 08:00 to 17:00.
 */
function getCurrentTimeSlot()
{
    const now = new Date();
    const hour = now.getHours();

    // if (hour < 8 || hour >= 17) return null; // Outside of uni hours

    const startTime = `${String(hour).padStart(2, '0')}:00`;
    const endTime = `${String(hour + 1).padStart(2, '0')}:00`;

    return {start : startTime, end : endTime};
}

module.exports = {
    haversineDistance,
    getWeekNumber,
    getCurrentTimeSlot
};
