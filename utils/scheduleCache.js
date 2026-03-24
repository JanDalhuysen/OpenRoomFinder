const { getRoomSchedule } = require("./timetable");

function normalizeDay(day) {
  return String(day || "")
    .trim()
    .toLowerCase()
    .slice(0, 3);
}

function buildKey(roomName, week, day) {
  return `${roomName}::${week}::${normalizeDay(day)}`;
}

async function runWithConcurrency(items, limit, worker) {
  const safeLimit = Math.max(1, Number(limit) || 1);
  let currentIndex = 0;

  const runners = Array.from({ length: Math.min(safeLimit, items.length) }, async () => {
    while (currentIndex < items.length) {
      const index = currentIndex;
      currentIndex += 1;
      await worker(items[index], index);
    }
  });

  await Promise.all(runners);
}

function createScheduleCache({ ttlMs = 2 * 60 * 60 * 1000, concurrency = 12 } = {}) {
  const cache = new Map();

  function isFresh(entry) {
    return entry && Date.now() - entry.fetchedAt <= ttlMs;
  }

  function cleanupStale() {
    const maxAge = ttlMs * 2;
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
      if (!value || now - value.fetchedAt > maxAge) {
        cache.delete(key);
      }
    }
  }

  async function fetchAndStore(roomName, week, day) {
    const key = buildKey(roomName, week, day);
    const previous = cache.get(key);

    try {
      const slots = await getRoomSchedule(roomName, week, day);
      cache.set(key, {
        slots,
        fetchedAt: Date.now(),
      });
      return slots;
    } catch (error) {
      if (previous) {
        console.warn(`Using stale cached schedule for ${roomName} (${week}/${normalizeDay(day)}) due to fetch error.`);
        return previous.slots;
      }

      console.error(`No cached schedule available for ${roomName} after fetch failure:`, error.message || error);
      return [];
    }
  }

  async function getScheduleForRoom(roomName, week, day) {
    const key = buildKey(roomName, week, day);
    const cached = cache.get(key);
    if (isFresh(cached)) {
      return cached.slots;
    }

    return fetchAndStore(roomName, week, day);
  }

  async function getSchedulesForRooms(rooms, week, day) {
    const schedules = new Array(rooms.length);
    await runWithConcurrency(rooms, concurrency, async (room, index) => {
      schedules[index] = await getScheduleForRoom(room.name, week, day);
    });
    return schedules;
  }

  async function refreshAll(rooms, week, day) {
    const startedAt = Date.now();

    await runWithConcurrency(rooms, concurrency, async (room) => {
      await fetchAndStore(room.name, week, day);
    });

    cleanupStale();

    return {
      roomCount: rooms.length,
      durationMs: Date.now() - startedAt,
      week,
      day: normalizeDay(day),
    };
  }

  return {
    getScheduleForRoom,
    getSchedulesForRooms,
    refreshAll,
  };
}

module.exports = { createScheduleCache };
