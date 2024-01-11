// Lookup tables for attributes

const revetment_lookup = {
    'riprap': {
        'rho': 2.65,
        'rho_': 1.6,
        'phi': 40,
        'psi': 0.035
    },
    'gabion': {
        'rho': 2.65,
        'rho_': 0.96,
        'phi': 40,
        'psi': 0.07
    },
    'concrete': {
        'rho': 1.8,
        'rho_': 0.96,
        'phi': 40,
        'psi': 0.07
    }
};

const protection_zone_lookup = {
    'riprap': {
        'continuous': 1,
        'transition': 1.5
    },
    'gabion': {
        'continuous': 0.75,
        'transition': 1
    },
    'concrete': {
        'continuous': 0.75,
        'transition': 1
    }
};

class RiverSection {
    constructor(sectionName, velocity_m_per_s, flow_rate_m3_per_s, invert_elevation_mAD, ds_reach_invert_elevation_mAD, ds_reach_length_m, water_level_mAD, bank_slope, revetmentType, ti, kt, rho, rho_pil, phi, psi, mu, bdrylayer, zone) {
        this.sectionName = sectionName;
        this.velocity_m_per_s = parseFloat(velocity_m_per_s);
        this.flow_rate_m3_per_s = parseFloat(flow_rate_m3_per_s);
        this.invert_elevation_mAD = parseFloat(invert_elevation_mAD);
        this.ds_reach_invert_elevation_mAD = parseFloat(ds_reach_invert_elevation_mAD);
        this.ds_reach_length_m = parseFloat(ds_reach_length_m);
        this.water_level_mAD = parseFloat(water_level_mAD);
        this.bank_slope = parseFloat(bank_slope);
        this.depth = this.water_level_mAD - this.invert_elevation_mAD;
        this.slope = (this.invert_elevation_mAD - this.ds_reach_invert_elevation_mAD) / this.ds_reach_length_m;
        this.alpha = Math.atan(this.bank_slope) * (180 / Math.PI); // Converted to degrees
        this.revetmentType = revetmentType
        this.ti = ti;
        this.kt = kt;
        this.rho = rho;
        this.rho_pil = rho_pil;
        this.phi = phi;
        this.psi = psi;
        this.mu = mu;
        this.bdrylayer = bdrylayer;
        this.zone = zone;
    }

    // CalculateEscMay, calculateKs, calculateKh, calculatePilarz methods
    calculateEscMay() {
        let ub2 = 0;
        let ci = 0;

        if (this.bdrylayer === "full") {
            ub2 = Math.pow((0.82 * 1.25 * this.velocity_m_per_s), 2);
        } else if (this.bdrylayer === "disrupted") {
            ub2 = Math.pow((0.87 * 1.25 * this.velocity_m_per_s), 2);
        }

        if (this.revetmentType === "riprap") {
            ci = 12.3 * this.ti - 0.2;
        } else if (this.revetmentType === "concrete") {
            ci = 9.22 * this.ti - 0.15;
        } else if (this.revetmentType === "gabion") {
            ci = 12.3 * this.ti - 1.65;
        }
        console.log(ub2, ci)
        const dn50 = ci * ub2 / (2 * 9.81 * (this.rho - 1));
        const d50 = ((dn50 / 0.91) + (dn50 / 0.84)) * 0.5

        return d50;
    }

    calculateKs() {
        const kd = Math.cos(this.toRadians(this.alpha)) * Math.sqrt(1 - Math.pow(Math.tan(this.toRadians(this.alpha)) / Math.tan(this.toRadians(this.phi)), 2));
        const kl = Math.sin(this.toRadians(this.phi - this.slope)) / Math.sin(this.toRadians(this.phi));
        const ks = kd * kl;
        return ks;
    }

    calculateKh(dn50) {
        if (this.bdrylayer == 'full') {
            return Math.pow(2 / Math.log10((12 * this.depth) / dn50), 2);
        }
        return Math.pow((dn50 / this.depth), 0.2);
    }

    calculatePilarz() {
        const u = (2 / 3) * this.velocity_m_per_s;
        const ks = this.calculateKs();
        let lowerBound = 0;
        let upperBound = 2;
        let bestGuess = (upperBound + lowerBound) / 2.0;

        for (let i = 0; i < 10000; i++) {
            const kh = this.calculateKh(bestGuess);
            const estimatedDn50 = this.mu / this.rho_pil * 0.035 / this.psi * (this.kt * kh / ks) * Math.pow(u, 2) / (2 * 9.81);
            // console.log(`kh: ${kh}, estimateddn50: ${estimatedDn50}, diff ${Math.abs(estimatedDn50 - bestGuess)}`)
            if (Math.abs(estimatedDn50 - bestGuess) < 1e-3) {
                const d50 = ((estimatedDn50 / 0.91) + (estimatedDn50 / 0.84)) * 0.5
                return d50;
            }

            if (estimatedDn50 > bestGuess) {
                lowerBound = bestGuess;
            } else {
                upperBound = bestGuess;
            }

            bestGuess = (upperBound + lowerBound) / 2.0;
        }

        throw new Error("Solution did not converge after 10000 iterations.");
    }


    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
}

// Form handler class to encapsulate form functions
class FormHandler {
    constructor(formId) {
        this.form = document.getElementById(formId);
        this.inputs = this.form.querySelectorAll('input, select');
    }

    getFormData() {
        const formData = {};
        this.inputs.forEach(input => {
            formData[input.id] = input.type === 'number' ? parseFloat(input.value) : input.value;
        });
        // console.log(formData)
        return formData;
    }

    setFormData(data) {
        this.inputs.forEach(input => {
            if (data[input.id] !== undefined) {
                input.value = data[input.id];
            }
        });
    }

    resetForm() {
        this.form.reset();
    }
}

const sections = [];
let chart;

// This function adds a new river section when the form is submitted
function addSection() {

    // Initialise a FormHandler object
    const formData = FormHandler.getFormData();
    console.log(`Form data ${formData}`)

    const sectionName = formData.sectionName;
    const velocity = formData.velocity;
    if (velocity > 4) {
        alert("Velocity cannot exceed 4 m/s.");
        return; // Stop the function if the velocity is too high
    }
    const flowRate = formData.flowRate;
    const invertElevation = formData.invertElevation;
    const dsReachInvertElevation = formData.dsReachInvertElevation;
    const dsReachLength = formData.dsReachLength;
    const waterLevel = formData.waterLevel;
    const bankSlope = formData.bankSlope;
    const ti = formData.ti;
    const kt = formData.kt;

    // lookup values
    const revetmentType = formData.revetmentType;
    const bdrylayer = formData.bdrylayer;
    const zone = formData.zone;

    // Get values from lookup
    const rho = revetment_lookup[revetmentType]['rho'];
    const rho_pil = revetment_lookup[revetmentType]['rho_'];
    const phi = revetment_lookup[revetmentType]['phi'];
    const psi = revetment_lookup[revetmentType]['psi'];
    const mu = protection_zone_lookup[revetmentType][zone];
    
    // Create a new RiverSection instance
    const section = new RiverSection(sectionName, velocity, flowRate, invertElevation, dsReachInvertElevation, dsReachLength, waterLevel, bankSlope, revetmentType, ti, kt, rho, rho_pil, phi, psi, mu, bdrylayer, zone);

    // Push the new section into the sections array
    sections.push(section);

    // Update the graph with the new data
    updateGraph();

    // Save sections to Local Storage
    saveSectionsToLocalStorage();

    // Dynamically update the table with the new section
    displaySections();
}


function displaySections() {
    const sectionsTableBody = document.getElementById('sectionsTableBody');
    sectionsTableBody.innerHTML = ''; // Clear existing rows

    sections.forEach((section, index) => {
        const row = sectionsTableBody.insertRow(-1); // Insert a row at the end of the table body
        row.innerHTML = `
            <td>${section.sectionName}</td>
            <td>${section.velocity_m_per_s.toFixed(2)}</td>
            <td>${section.flow_rate_m3_per_s.toFixed(2)}</td>
            <td>${section.invert_elevation_mAD.toFixed(2)}</td>
            <td>${section.ds_reach_invert_elevation_mAD.toFixed(2)}</td>
            <td>${section.ds_reach_length_m.toFixed(2)}</td>
            <td>${section.water_level_mAD.toFixed(2)}</td>
            <td>${section.calculateEscMay().toFixed(3)}</td>
            <td>${section.calculatePilarz().toFixed(3)}</td>
            <td><button onclick="editSection(${index})">Edit</button></td>
            <td><button onclick="deleteSection(${index})">Delete</button></td>
        `;
    });
}

function editSection(index) {
    const section = sections[index];

    FormHandler.setFormData({
        sectionName: section.sectionName,
        velocity: section.velocity_m_per_s,
        flowRate: section.flow_rate_m3_per_s,
        invertElevation: section.invert_elevation_mAD,
        dsReachInvertElevation: section.ds_reach_invert_elevation_mAD,
        dsReachLength: section.ds_reach_length_m,
        waterLevel: section.water_level_mAD,
        bankSlope: section.bank_slope,
        reventmentType: section.reventmentType,
        ti:section.ti,
        kt:section.kt,
        bdrylayer: section.bdrylayer,
        zone: section.zone
    });
    
    // Remove existing event listeners
    button.replaceWith(button.cloneNode(true));
    
    // Update the button for saving the edited section
    const saveButton = document.getElementById('addSectionButton');
    saveButton.textContent = 'Save';
    saveButton.onclick = function() {
    saveEditedSection(index);
    };
}


function deleteSection(index) {
    // Confirm before deleting
    const confirmDelete = confirm("Are you sure you want to delete this section?");
    if (!confirmDelete) {
        return; // Stop if the user cancels
    }

    // Remove the section from the array
    sections.splice(index, 1);

    // Update the graph, save to local storage, and refresh the display
    updateGraph();
    saveSectionsToLocalStorage();
    displaySections();
}


function saveEditedSection(index) {
    const formData = FormHandler.getFormData();

    const section = sections[index];
    section.sectionName = formData.sectionName;
    section.velocity_m_per_s = parseFloat(formData.velocity);
    section.flow_rate_m3_per_s = parseFloat(formData.flowRate);
    section.invert_elevation_mAD = parseFloat(formData.invertElevation);
    section.ds_reach_invert_elevation_mAD = parseFloat(formData.dsReachInvertElevation);
    section.ds_reach_length_m = parseFloat(formData.dsReachLength);
    section.water_level_mAD = parseFloat(formData.waterLevel);
    section.bank_slope = parseFloat(formData.bankSlope);
    section.ti = formData.ti;
    section.kt = formData.kt;
    section.bdrylayer = formData.bdrylayer;
    section.zone = formData.zone;
    section.revetmentType = formData.revetmentType;

    // consts assigned using lookup 
    const revetmentData = revetment_lookup[formData.revetmentType];
    section.rho = revetmentData.rho;
    section.rho_pil = revetmentData.rho_;
    section.phi = revetmentData.phi;
    section.psi = revetmentData.psi;
    section.mu = protection_zone_lookup[formData.revetmentType][formData.zone];

    // Update graph, save to local storage, and refresh the display
    updateGraph();
    saveSectionsToLocalStorage();
    displaySections();

    // Reset the button back to 'Add Section' and clear the form
    resetAddButton();
    FormHandler.resetForm();
}


function resetAddButton() {
    const addButton = document.getElementById('addSectionButton');
    addButton.textContent = 'Add Section';
    addButton.onclick = addSection;
}


function updateGraph() {
    // cumulatively calculate the total distance based on the downstream reach lengths
    let cumulativeLength = 0;
    const ds_reach_lengths = sections.map((section, index) => {
        if (index > 0) {
            cumulativeLength += sections[index - 1].ds_reach_length_m;
        }
        return cumulativeLength;
    });
    // const ds_reach_lengths = sections.map(section => section.ds_reach_length_m);
    const escMayValues = sections.map(section => section.calculateEscMay());
    const pilarzValues = sections.map(section => section.calculatePilarz());
    const average = sections.map(section => (section.calculateEscMay() + section.calculatePilarz()) / 2);

    const chartData = {
        labels: ds_reach_lengths,
        datasets: [{
            label: 'escMay Value',
            stepped: true,
            backgroundColor: 'rgb(255, 99, 132)',
            borderColor: 'rgb(255, 99, 132)',
            data: escMayValues
        }, {
            label: 'Pilarz Value',
            stepped: true,
            backgroundColor: 'rgb(54, 162, 235)',
            borderColor: 'rgb(54, 162, 235)',
            data: pilarzValues
        }, {
            label: 'Average',
            stepped: true,
            backgroundColor: 'rgb(0, 162, 0)',
            borderColor: 'rgb(0, 162, 0)',
            data: average
        }]
    };

    if (chart) {
        chart.data = chartData;
        chart.update();
    } else {
        chart = new Chart(document.getElementById('resultGraph').getContext('2d'), {
            type: 'line',
            data: chartData,
            options: {
                responsive: true,
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        title: {
                            display: true,
                            text: 'Reach length (m)'
                        }
                    },
                    y: { 
                        beginAtZero: false, 
                        type: 'linear',
                        title: {
                            display: true,
                            text: 'D50 (m)'
                        }
                        }
                }
            }
        });
    }
}

// Save sections to Local Storage
function saveSectionsToLocalStorage() {
    const simplifiedSections = sections.map(section => ({
        sectionName: section.sectionName,
        velocity_m_per_s: section.velocity_m_per_s,
        flow_rate_m3_per_s: section.flow_rate_m3_per_s,
        invert_elevation_mAD: section.invert_elevation_mAD,
        ds_reach_invert_elevation_mAD: section.ds_reach_invert_elevation_mAD,
        ds_reach_length_m: section.ds_reach_length_m,
        water_level_mAD: section.water_level_mAD,
        bank_slope: section.bank_slope,
        revetmentType: section.revetmentType,
        ti: section.ti,
        kt: section.kt,
        rho: section.rho,
        rho_pil: section.rho_pil,
        phi: section.phi,
        psi: section.psi,
        mu: section.mu,
        bdrylayer: section.bdrylayer,
        zone: section.zone
    }));
    localStorage.setItem('sections', JSON.stringify(simplifiedSections));
}


function loadSectionsFromLocalStorage() {
    const savedSections = localStorage.getItem('sections');
    if (savedSections) {
        const parsedSections = JSON.parse(savedSections);
        console.log(parsedSections)
        sections.length = 0; // Clear the existing array
        parsedSections.forEach(sectionData => {
            const section = new RiverSection(
                // sectionData.id,
                sectionData.sectionName,
                sectionData.velocity_m_per_s,
                sectionData.flow_rate_m3_per_s,
                sectionData.invert_elevation_mAD,
                sectionData.ds_reach_invert_elevation_mAD,
                sectionData.ds_reach_length_m,
                sectionData.water_level_mAD,
                sectionData.bank_slope,
                sectionData.revetmentType,
                sectionData.ti,
                sectionData.kt,
                sectionData.rho,
                sectionData.rho_pil,
                sectionData.phi,
                sectionData.psi,
                sectionData.mu,
                sectionData.bdrylayer,
                sectionData.zone
            );

            sections.push(section);
        });

    }
}

function downloadJson() {
    const data = localStorage.getItem('sections');
    if (!data) {
        alert("No data available to download.");
        return;
    }

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // Create a link and set the URL as the href
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sections_data.json';

    // Append link, trigger download, then remove link
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Revoke the object URL
    URL.revokeObjectURL(url);
}

function uploadJson() {
    const fileInput = document.getElementById('jsonFileInput');
    if (!fileInput.files.length) {
        alert("Please select a file to upload.");
        return;
    }

    const file = fileInput.files[0];
    if (file.type !== "application/json") {
        alert("Please select a JSON file.");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const json = JSON.parse(event.target.result);
            localStorage.setItem('sections', JSON.stringify(json));
            alert("File uploaded and data stored in localStorage.");
            // Optionally, refresh or update your app's data display
            // displaySections();
        } catch (e) {
            alert("Error parsing JSON file.");
        }
    };
    reader.readAsText(file);
}

// Add event listener to the upload and download buttons
document.getElementById('downloadJsonButton').addEventListener('click', downloadJson);
document.getElementById('uploadJsonButton').addEventListener('click', uploadJson); 


window.onload = function() {
    FormHandler = new FormHandler('sectionForm');
    // Load sections from local storage
    loadSectionsFromLocalStorage();
    // Display the loaded sections
    displaySections();
    updateGraph(); // Load the graph with existing data
    
    document.getElementById('addSectionButton').addEventListener('click', addSection);
};