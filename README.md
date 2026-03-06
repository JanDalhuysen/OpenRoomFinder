# OpenRoomFinder

A web application that helps you find available rooms on a campus based on your current location, timetable, and time slot.

## Features

- **Find Available Rooms**: Discover free rooms at your campus during a specific time slot
- **Smart Routing**: Rank rooms by total distance — from your current location → available room → next class
- **Timetable Integration**: Upload your ICS timetable to automatically determine your last and next class locations
- **GPS Support**: Use your current GPS location as the starting point
- **Manual Selection**: Choose your last class location from a list of buildings

## Installation

```bash
npm install
```

## Usage

```bash
npm start
```

The server will start at `http://localhost:3000`.

## How It Works

1. **Enter your current situation**:
   - Upload an ICS timetable file (from Google Calendar, Outlook, etc.) to automatically detect your last and next class
   - OR select your last class location manually
   - Optionally provide GPS coordinates for your current location

2. **Select a time slot**:
   - Choose a specific time (e.g., 09:00)
   - OR let the app use the current time

3. **View results**:
   - The app finds all available rooms for that time slot
   - Ranks them by total walking distance
   - Shows the closest rooms first

## Project Structure

```
.
├── server.js          # Main Express server
├── data/
│   └── locations.json # Building/location data
│   └── *_rooms.txt   # Room lists per building
├── views/
│   ├── index.ejs     # Search form
│   └── results.ejs   # Results page
├── utils/
│   ├── timetable.js  # Room schedule fetching
│   ├── helpers.js    # Distance calculations
│   └── ics.js       # ICS file parsing
└── package.json
```

## Dependencies

- express
- ejs
- body-parser
- multer
- jsdom
- node-fetch
