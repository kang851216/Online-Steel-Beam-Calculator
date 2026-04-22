# Online Steel Beam Calculator

Demo : https://onlinebeamcalculator-9h57vedgy-kang851216s-projects.vercel.app/
<img width="2537" height="941" alt="image" src="https://github.com/user-attachments/assets/4e9254d0-73d8-4403-a086-1cb4bcf8adbe" />

A web-based engineering tool designed for structural engineers and students to perform quick and accurate steel beam analysis. This application calculates shear forces, bending moments, and deflections for various loading conditions and beam profiles.

## 🚀 Features

* **Real-time Calculations:** Instantaneous feedback on structural capacity as parameters are adjusted.
* **Support for Multiple Load Types:** Handles point loads, uniformly distributed loads (UDL), and partial loads.
* **Steel Profile Database:** Includes standard sections (UB, UC, I-beams, etc.) with pre-populated geometric properties.
* **Visual Diagrams:** Generates Shear Force Diagrams (SFD) and Bending Moment Diagrams (BMD).
* **Code Compliance:** Verification against standard safety factors and structural codes.

## 🛠 Tech Stack

* **Backend:** Python / Flask
* **Frontend:** HTML5, CSS3, JavaScript (Canvas/SVG for diagrams)
* **Engineering Logic:** NumPy / SciPy
* **Style:** Bootstrap for a clean, mobile-responsive interface.

## 📋 Getting Started

### Prerequisites
* Python 3.8+
* pip

### Installation

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/kang851216/Online-Steel-Beam-Calculator.git](https://github.com/kang851216/Online-Steel-Beam-Calculator.git)
    cd Online-Steel-Beam-Calculator
    ```

2.  **Set up a virtual environment:**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows use `venv\Scripts\activate`
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Run the application:**
    ```bash
    python app.py
    ```

## 📐 Usage

1. Input the beam span length.
2. Select the steel section type from the dropdown menu.
3. Add loads (magnitude and position).
4. View the calculated maximum bending moment, shear force, and vertical deflection.

## 🗺 Roadmap

- [ ] Support for continuous beams (multiple spans).
- [ ] Integration with CAD exports.
- [ ] User authentication for saving and exporting calculation reports.
- [ ] Automated check for lateral-torsional buckling.
