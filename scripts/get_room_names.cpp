#include <iostream>
#include <string>
#include <vector>

std::vector<std::string> extractOptionValues(const std::string& html) {
    std::vector<std::string> values;
    std::string::size_type pos = 0;

    while ((pos = html.find("<option value=", pos)) != std::string::npos) {
        pos += 15; // Move past '<option value="'
        auto endPos = html.find(">", pos);
        if (endPos != std::string::npos) {
            values.push_back(html.substr(pos-1, endPos - pos + 1));
            pos = endPos;
        }
    }

    return values;
}

int main() {
    std::string html = R"(



                      <option value=VdSterr (El.Class)_2055(Entrance5) selected=>
                        Van der Sterr (Electr. classr.) 2055 (Entrance5)
                      </option>

                      <option value=VdSterr (El.Class)_3051(Entrance3)>
                        Van der Sterr (Electr. classr.) 3051 (Entrance3)
                      </option>

                      <option value=VdSterr (El.Class)_3054(Entrance3)>
                        Van der Sterr (Electr. classr.) 3054 (Entrance3)
                      </option>

                      <option value=VdSterr_1003(Entrance6)>
                        Van der Sterr 1003 (Entrance6)
                      </option>

                      <option value=VdSterr_1004(Entrance6)>
                        Van der Sterr 1004 (Entrance6)
                      </option>

                      <option value=VdSterr_1010(Entrance6)>
                        Van der Sterr 1010 (Entrance6)
                      </option>

                      <option value=VdSterr_1011(Entrance5)>
                        Van der Sterr 1011 (Entrance5)
                      </option>

                      <option value=VdSterr_1017(Entrance5)>
                        Van der Sterr 1017 (Entrance5)
                      </option>

                      <option value=VdSterr_1024(Entrance4)>
                        Van der Sterr 1024 (Entrance4)
                      </option>

                      <option value=VdSterr_1026(Entrance3)>
                        Van der Sterr 1026 (Entrance3)
                      </option>

                      <option value=VdSterr_1031(Entrance3)>
                        Van der Sterr 1031 (Entrance3)
                      </option>

                      <option value=VdSterr_1032(Entrance2)>
                        Van der Sterr 1032 (Entrance2)
                      </option>

                      <option value=VdSterr_1033(Entrance2)>
                        Van der Sterr 1033 (Entrance2)
                      </option>

                      <option value=VdSterr_1041 Boardroom(Entrance1)>
                        Van der Sterr 1041 Boardroom 1st floor (Entrance1)
                      </option>

                      <option value=VdSterr_1045 Open area(Entrance1)>
                        Van der Sterr 1045 Open area 1st floor (Entrance1)
                      </option>

                      <option value=VdSterr_1046(Entrance1)>
                        Van der Sterr 1046 (Entrance1)
                      </option>

                      <option value=VdSterr_2048(Entrance5)>
                        Van der Sterr 2048 (Entrance5)
                      </option>

                      <option value=VdSterr_2053(Entrance5)>
                        Van der Sterr 2053 (Entrance5)
                      </option>

                      <option value=VdSterr_2054(Entrance5)>
                        Van der Sterr 2054 (Entrance5)
                      </option>

                      <option value=VdSterr_2058(Entrance3)>
                        Van der Sterr 2058 (Entrance3)
                      </option>

                      <option value=VdSterr_2118(Entrance1)>
                        Van der Sterr 2118 (Entrance1)
                      </option>

                      <option value=VdSterr_2121(Entrance1)>
                        Van der Sterr 2121 (Entrance1)
                      </option>

                      <option value=VdSterr_3124(Entrance1)>
                        Van der Sterr 3124 (Entrance1)
                      </option>

                      <option value=VdSterr_3131(Entrance1)>
                        Van der Sterr 3131 (Entrance1)
                      </option>
    )";

    std::vector<std::string> values = extractOptionValues(html);

    // std::cout << "Extracted values:\n";
    for (const auto& value : values) {
        std::cout << value << std::endl;
    }

    return 0;
}
