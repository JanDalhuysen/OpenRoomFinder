#include <algorithm> // For std::transform
#include <cctype>    // For ::toupper
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

// Include the nlohmann/json library header
// Make sure json.hpp is in the same directory as this file
#include "json.hpp"

// Use the nlohmann namespace for convenience
using json = nlohmann::json;

// Function to create a clean, uppercase ID from a building name
std::string createIdFromName(const std::string &name)
{
    std::string id = name;
    // Replace spaces with underscores
    std::replace(id.begin(), id.end(), ' ', '_');
    // Convert to uppercase
    std::transform(id.begin(), id.end(), id.begin(), ::toupper);
    return id;
}

int main()
{
    // --- 1. Read the input GeoJSON file ---
    std::ifstream inputFile("export.geojson");
    if (!inputFile.is_open())
    {
        std::cerr << "Error: Could not open input.geojson" << std::endl;
        return 1; // Exit with an error code
    }

    json geojsonData;
    try
    {
        // Parse the file stream directly into the json object
        inputFile >> geojsonData;
    }
    catch (json::parse_error &e)
    {
        std::cerr << "Error: Failed to parse GeoJSON. " << e.what() << std::endl;
        return 1;
    }
    inputFile.close();

    // --- 2. Transform the data ---
    json outputJson = json::array(); // Create an empty JSON array

    // Check if the "features" key exists and is an array
    if (geojsonData.contains("features") && geojsonData["features"].is_array())
    {
        // Iterate over each "feature" in the GeoJSON features array
        for (const auto &feature : geojsonData["features"])
        {
            // Ensure the feature has the properties we need
            if (feature.contains("properties") && feature["properties"].contains("name") &&
                feature.contains("geometry") && feature["geometry"].contains("coordinates"))
            {

                // Extract the building name
                std::string buildingName = feature["properties"]["name"];

                // Extract coordinates: [longitude, latitude]
                const auto &coords = feature["geometry"]["coordinates"];
                double lon = coords[0];
                double lat = coords[1];

                // Create a new JSON object in our target format
                json locationObject;
                locationObject["id"] = createIdFromName(buildingName);
                locationObject["name"] = buildingName; // Or a more specific room name if available
                locationObject["building"] = buildingName;
                locationObject["lat"] = lat;
                locationObject["lon"] = lon;

                // Add the new object to our output array
                outputJson.push_back(locationObject);
            }
        }
    }
    else
    {
        std::cerr << "Error: input.geojson does not contain a 'features' array." << std::endl;
        return 1;
    }

    // --- 3. Write the output JSON file ---
    std::ofstream outputFile("locations.json");
    if (!outputFile.is_open())
    {
        std::cerr << "Error: Could not open locations.json for writing." << std::endl;
        return 1;
    }

    // Write the formatted JSON to the file with an indent of 2 spaces for readability
    outputFile << outputJson.dump(2);
    outputFile.close();

    std::cout << "Successfully converted " << outputJson.size() << " features." << std::endl;
    std::cout << "Output written to locations.json" << std::endl;

    return 0; // Success
}
