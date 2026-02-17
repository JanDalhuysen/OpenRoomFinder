function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function unfoldIcs(text) {
  return String(text || "").replace(/\r?\n[ \t]/g, "");
}

function parseIcsDate(value) {
  const clean = String(value || "").trim();
  if (/^\d{8}T\d{6}Z?$/.test(clean)) {
    const year = Number(clean.slice(0, 4));
    const month = Number(clean.slice(4, 6));
    const day = Number(clean.slice(6, 8));
    const hour = Number(clean.slice(9, 11));
    const minute = Number(clean.slice(11, 13));
    const second = Number(clean.slice(13, 15));
    if (clean.endsWith("Z")) {
      return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    }
    return new Date(year, month - 1, day, hour, minute, second);
  }

  if (/^\d{8}$/.test(clean)) {
    const year = Number(clean.slice(0, 4));
    const month = Number(clean.slice(4, 6));
    const day = Number(clean.slice(6, 8));
    return new Date(year, month - 1, day);
  }

  return null;
}

function parseIcsEvents(icsText) {
  const unfolded = unfoldIcs(icsText);
  const events = [];
  const chunks = unfolded.split("BEGIN:VEVENT").slice(1);

  for (const chunk of chunks) {
    const endIndex = chunk.indexOf("END:VEVENT");
    if (endIndex === -1) continue;

    const body = chunk.slice(0, endIndex).trim();
    const lines = body.split(/\r?\n/);
    const event = {};

    for (const line of lines) {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) continue;

      const rawKey = line.slice(0, separatorIndex);
      const value = line.slice(separatorIndex + 1).trim();
      const key = rawKey.split(";")[0].toUpperCase();

      if (key === "DTSTART") {
        event.start = parseIcsDate(value);
      } else if (key === "DTEND") {
        event.end = parseIcsDate(value);
      } else if (key === "LOCATION") {
        event.location = value.replace(/\\,/g, ",").replace(/\\n/g, " ").trim();
      } else if (key === "SUMMARY") {
        event.summary = value;
      }
    }

    if (event.start && event.end && event.location) {
      events.push(event);
    }
  }

  return events;
}

function isSameLocalDate(left, right) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function extractBuildingToken(location) {
  const raw = String(location || "");
  const beforeRoom = raw.split("_")[0];
  return beforeRoom
    .replace(/\(.*?\)/g, " ")
    .replace(/\//g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildLocationIndex(locations) {
  const index = new Map();
  for (const loc of locations) {
    index.set(normalizeKey(loc.building), loc);
    index.set(normalizeKey(loc.name), loc);
  }
  return index;
}

function matchLocationFromIcs(location, locations, index) {
  const buildingToken = extractBuildingToken(location);
  const normalized = normalizeKey(buildingToken);

  if (index.has(normalized)) {
    return index.get(normalized);
  }

  const aliasMap = {
    janmouton: "Jan Mouton Learning Centre",
    janmoutonlearningcentre: "Jan Mouton Learning Centre",
    vdsterr: "Van Der Sterr",
    vandersterr: "Van Der Sterr",
    indpsyc: "Industrial Psychology",
    mathsciindpsyc: "Industrial Psychology",
    mathsci: "Industrial Psychology",
    merensky: "Merensky",
    narga: "Natural Science",
    engrg: "Electrical Engineering",
    engrgel: "Electrical Engineering",
  };

  const alias = aliasMap[normalized];
  if (alias) {
    const aliasKey = normalizeKey(alias);
    if (index.has(aliasKey)) {
      return index.get(aliasKey);
    }
  }

  let bestMatch = null;
  let bestScore = 0;

  for (const loc of locations) {
    const locKey = normalizeKey(loc.building);
    if (!locKey) continue;
    if (normalized.includes(locKey) || locKey.includes(normalized)) {
      const score = Math.min(normalized.length, locKey.length);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = loc;
      }
    }
  }

  return bestMatch;
}

function deriveScheduleFromEvents(events, now) {
  const todayEvents = events.filter((event) => isSameLocalDate(event.start, now));

  if (todayEvents.length === 0) {
    return { error: "No events found for today in the timetable file." };
  }

  todayEvents.sort((a, b) => a.start - b.start);

  const currentEvent = todayEvents.find((event) => event.start <= now && now < event.end);
  if (currentEvent) {
    const nextEvent = todayEvents.find((event) => event.start >= currentEvent.end);
    if (!nextEvent) {
      return { error: "Could not find a class after your current class today." };
    }

    const gapMinutes = (nextEvent.start - currentEvent.end) / 60000;
    if (gapMinutes < 60) {
      return { error: "Your next class starts in less than an hour after your current class ends." };
    }

    return { lastEvent: currentEvent, nextEvent, referenceTime: currentEvent.end };
  }

  const lastEvent = [...todayEvents].filter((event) => event.end <= now).pop();
  const nextEvent = todayEvents.find((event) => event.start >= now);

  if (!lastEvent || !nextEvent) {
    return { error: "Could not find both a previous and upcoming class for today." };
  }

  const gapMinutes = (nextEvent.start - now) / 60000;
  if (gapMinutes < 60) {
    return { error: "Your next class starts in less than an hour, so no free hour is available." };
  }

  return { lastEvent, nextEvent, referenceTime: now };
}

function getScheduleFromIcs(icsText, now, locations) {
  const events = parseIcsEvents(icsText);
  if (events.length === 0) {
    return { error: "No events could be parsed from the uploaded timetable file." };
  }

  const derived = deriveScheduleFromEvents(events, now);
  if (derived.error) {
    return { error: derived.error };
  }

  const index = buildLocationIndex(locations);
  const lastLocation = matchLocationFromIcs(derived.lastEvent.location, locations, index);
  const nextLocation = matchLocationFromIcs(derived.nextEvent.location, locations, index);

  if (!lastLocation) {
    return { error: `Could not match your last class location (${derived.lastEvent.location}) to a campus building.` };
  }

  if (!nextLocation) {
    return { error: `Could not match your next class location (${derived.nextEvent.location}) to a campus building.` };
  }

  return {
    lastLocation,
    nextLocation,
    lastEvent: derived.lastEvent,
    nextEvent: derived.nextEvent,
    referenceTime: derived.referenceTime,
  };
}

module.exports = { getScheduleFromIcs };
