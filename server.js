const express = require("express");
const cors = require("cors");
const axios = require("axios");
const moment = require("moment");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CRM API Configuration
const CRM_CONFIG = {
  baseURL: process.env.CRM_API_BASE_URL || "https://cliniccards.com/api",
  token: process.env.CRM_API_TOKEN,
  headers: {
    Token: process.env.CRM_API_TOKEN,
    "Content-Type": "application/json",
  },
};

// Default configuration
const DEFAULT_CONFIG = {
  doctorId: process.env.DEFAULT_DOCTOR_ID || process.env.DOCTOR_ID_1 || "11111",
  doctor1Id: process.env.DOCTOR_ID_1 || process.env.DEFAULT_DOCTOR_ID || null,
  doctor2Id: process.env.DOCTOR_ID_2 || null,
  cabinet1Id: process.env.CABINET_1_ID || "10000",
  cabinet2Id: process.env.CABINET_2_ID || "20000",
  workStartHour: parseInt(process.env.WORK_START_HOUR) || 9,
  workEndHour: parseInt(process.env.WORK_END_HOUR) || 19,
  appointmentDuration: parseInt(process.env.APPOINTMENT_DURATION_MINUTES) || 30,
};

// Helper function to make CRM API requests
async function makeCRMRequest(endpoint, method = "GET", data = null) {
  try {
    const config = {
      method,
      url: `${CRM_CONFIG.baseURL}${endpoint}`,
      headers: CRM_CONFIG.headers,
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(
      `CRM API Error (${endpoint}):`,
      error.response?.data || error.message
    );
    throw error;
  }
}

// Generate time slots for a given date
function generateTimeSlots(date) {
  const slots = [];
  const startHour = DEFAULT_CONFIG.workStartHour;
  const endHour = DEFAULT_CONFIG.workEndHour;
  const duration = DEFAULT_CONFIG.appointmentDuration;

  for (let hour = startHour; hour < endHour; hour++) {
    for (let minutes = 0; minutes < 60; minutes += duration) {
      const timeString = `${hour.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}`;
      slots.push(timeString);
    }
  }

  return slots;
}

// Utility: split day into time slots inside provided intervals
function buildSlotsFromIntervals(date, intervals, slotMinutes) {
  const slots = new Set();
  intervals.forEach((interval) => {
    const start = moment(interval.start);
    const end = moment(interval.end);
    for (
      let m = start.clone();
      m.isBefore(end);
      m.add(slotMinutes, "minutes")
    ) {
      const next = m.clone().add(slotMinutes, "minutes");
      if (next.isAfter(end)) break;
      slots.add(m.format("HH:mm"));
    }
  });
  return Array.from(slots);
}

// Build working intervals per cabinet from schedule-spaces
function computeCabinetOpenIntervals(date, spaces) {
  const dayStart = moment(`${date} 00:00:00`, "YYYY-MM-DD HH:mm:ss");
  const dayEnd = dayStart.clone().endOf("day");
  const byCabinet = {};

  spaces.forEach((s) => {
    const start = moment(s.space_start, "YYYY-MM-DD HH:mm:ss");
    const end = moment(s.space_end, "YYYY-MM-DD HH:mm:ss");
    const cabId =
      s.schedule_cabinets_id || s.cabinet_id || s.schedule_cabinet_id;
    if (!cabId) return;
    if (!byCabinet[cabId]) byCabinet[cabId] = { opens: [], blocks: [] };

    // Treat "Anonymous shift" as open time; others (Clean-up, Rest, etc.) as blocks
    if ((s.type || "").toLowerCase() === "anonymous shift") {
      byCabinet[cabId].opens.push({
        start: moment.max(start, dayStart).toISOString(),
        end: moment.min(end, dayEnd).toISOString(),
      });
    } else {
      byCabinet[cabId].blocks.push({
        start: moment.max(start, dayStart).toISOString(),
        end: moment.min(end, dayEnd).toISOString(),
      });
    }
  });

  // Subtract blocks from opens
  const result = {};
  Object.keys(byCabinet).forEach((cabId) => {
    let intervals = byCabinet[cabId].opens.map((i) => ({
      start: moment(i.start),
      end: moment(i.end),
    }));
    byCabinet[cabId].blocks.forEach((block) => {
      const bStart = moment(block.start);
      const bEnd = moment(block.end);
      const newIntervals = [];
      intervals.forEach((iv) => {
        // no overlap
        if (bEnd.isSameOrBefore(iv.start) || bStart.isSameOrAfter(iv.end)) {
          newIntervals.push(iv);
        } else {
          // overlap: split
          if (bStart.isAfter(iv.start)) {
            newIntervals.push({ start: iv.start.clone(), end: bStart.clone() });
          }
          if (bEnd.isBefore(iv.end)) {
            newIntervals.push({ start: bEnd.clone(), end: iv.end.clone() });
          }
        }
      });
      intervals = newIntervals;
    });
    result[cabId] = intervals.map((iv) => ({
      start: iv.start.toISOString(),
      end: iv.end.toISOString(),
    }));
  });

  return result;
}

// Get available time slots for a specific date
app.get("/api/available-times/:date", async (req, res) => {
  try {
    const { date } = req.params;

    // Validate date format
    if (!moment(date, "YYYY-MM-DD", true).isValid()) {
      return res
        .status(400)
        .json({ error: "Invalid date format. Use YYYY-MM-DD" });
    }

    // 1) Get schedule spaces for the date
    const spacesResponse = await makeCRMRequest(
      `/schedule-spaces?from=${date}&to=${date}`
    );
    const spaces = spacesResponse.data || [];

    // Build open intervals per cabinet respecting blocks
    const openIntervalsByCabinet = computeCabinetOpenIntervals(date, spaces);

    // 2) Generate slots per cabinet from intervals
    let cabinet1Intervals =
      openIntervalsByCabinet[DEFAULT_CONFIG.cabinet1Id] || [];
    let cabinet2Intervals =
      openIntervalsByCabinet[DEFAULT_CONFIG.cabinet2Id] || [];

    let cabinet1Slots = buildSlotsFromIntervals(
      date,
      cabinet1Intervals,
      DEFAULT_CONFIG.appointmentDuration
    );
    let cabinet2Slots = buildSlotsFromIntervals(
      date,
      cabinet2Intervals,
      DEFAULT_CONFIG.appointmentDuration
    );

    // Fallback: if no schedule-spaces matched configured cabinets, use default working hours
    if (
      spaces.length === 0 ||
      (cabinet1Slots.length === 0 && cabinet2Slots.length === 0)
    ) {
      const allSlots = generateTimeSlots(date);
      cabinet1Intervals = [
        {
          start: `${date} ${String(DEFAULT_CONFIG.workStartHour).padStart(
            2,
            "0"
          )}:00:00`,
          end: `${date} ${String(DEFAULT_CONFIG.workEndHour).padStart(
            2,
            "0"
          )}:00:00`,
        },
      ];
      cabinet2Intervals = cabinet1Intervals;
      cabinet1Slots = allSlots.slice();
      cabinet2Slots = allSlots.slice();
    }

    // 3) Get existing visits for the date and mark occupied (by overlapping intervals)
    const visitsResponse = await makeCRMRequest(
      `/visits?from=${date}&to=${date}`
    );
    const existingVisits = visitsResponse.data || [];

    // Track occupied slots by cabinet and doctor
    const occupiedSlots = {
      [DEFAULT_CONFIG.cabinet1Id]: new Set(),
      [DEFAULT_CONFIG.cabinet2Id]: new Set(),
    };
    const occupiedByDoctor = {};
    if (DEFAULT_CONFIG.doctor1Id)
      occupiedByDoctor[DEFAULT_CONFIG.doctor1Id] = new Set();
    if (DEFAULT_CONFIG.doctor2Id)
      occupiedByDoctor[DEFAULT_CONFIG.doctor2Id] = new Set();

    function overlaps(slotStartStr, vStart, vEnd) {
      const slotStart = moment(`${date} ${slotStartStr}`, "YYYY-MM-DD HH:mm");
      const slotEnd = slotStart
        .clone()
        .add(DEFAULT_CONFIG.appointmentDuration, "minutes");
      return slotStart.isBefore(vEnd) && slotEnd.isAfter(vStart);
    }

    existingVisits.forEach((visit) => {
      // Extract time from visit_start/visit_end (format: "2025-10-17 09:15:00")
      const vStartTime = visit.visit_start
        ? visit.visit_start.split(" ")[1]
        : visit.time_start;
      const vEndTime = visit.visit_end
        ? visit.visit_end.split(" ")[1]
        : visit.time_end;

      const vStart = moment(`${date} ${vStartTime}`, "YYYY-MM-DD HH:mm");
      const vEnd = vEndTime
        ? moment(`${date} ${vEndTime}`, "YYYY-MM-DD HH:mm")
        : vStart.clone().add(DEFAULT_CONFIG.appointmentDuration, "minutes");

      // Mark by cabinet
      if (String(visit.cabinet_id) === String(DEFAULT_CONFIG.cabinet1Id)) {
        cabinet1Slots.forEach((s) => {
          if (overlaps(s, vStart, vEnd))
            occupiedSlots[DEFAULT_CONFIG.cabinet1Id].add(s);
        });
      }
      if (String(visit.cabinet_id) === String(DEFAULT_CONFIG.cabinet2Id)) {
        cabinet2Slots.forEach((s) => {
          if (overlaps(s, vStart, vEnd))
            occupiedSlots[DEFAULT_CONFIG.cabinet2Id].add(s);
        });
      }

      // Mark by doctor
      if (occupiedByDoctor[visit.doctor_id]) {
        const allSlotsForDay = Array.from(
          new Set([...cabinet1Slots, ...cabinet2Slots])
        );
        allSlotsForDay.forEach((s) => {
          if (overlaps(s, vStart, vEnd))
            occupiedByDoctor[visit.doctor_id].add(s);
        });
      }
    });

    // Available per cabinet = generated - occupied
    const cab1Available = cabinet1Slots.filter(
      (s) => !occupiedSlots[DEFAULT_CONFIG.cabinet1Id].has(s)
    );
    const cab2Available = cabinet2Slots.filter(
      (s) => !occupiedSlots[DEFAULT_CONFIG.cabinet2Id].has(s)
    );

    // Union by time where at least one cabinet free
    const availableSet = new Set([...cab1Available, ...cab2Available]);
    const availableSlots = Array.from(availableSet).sort();

    // Compute available doctor/cabinet pairs per time slot
    const doctors = [DEFAULT_CONFIG.doctor1Id, DEFAULT_CONFIG.doctor2Id].filter(
      Boolean
    );
    const pairsByTime = {};
    availableSlots.forEach((slot) => {
      const pairs = [];
      const freeCabinets = [];
      if (!occupiedSlots[DEFAULT_CONFIG.cabinet1Id].has(slot))
        freeCabinets.push(DEFAULT_CONFIG.cabinet1Id);
      if (!occupiedSlots[DEFAULT_CONFIG.cabinet2Id].has(slot))
        freeCabinets.push(DEFAULT_CONFIG.cabinet2Id);
      freeCabinets.forEach((cabId) => {
        doctors.forEach((docId) => {
          const isDocFree =
            !occupiedByDoctor[docId] || !occupiedByDoctor[docId].has(slot);
          if (isDocFree)
            pairs.push({ cabinetId: String(cabId), doctorId: String(docId) });
        });
      });
      pairsByTime[slot] = pairs;
    });

    res.json({
      date,
      availableSlots,
      totalSlots: availableSlots.length,
      occupiedSlots: {
        cabinet1: Array.from(occupiedSlots[DEFAULT_CONFIG.cabinet1Id]),
        cabinet2: Array.from(occupiedSlots[DEFAULT_CONFIG.cabinet2Id]),
      },
      intervals: {
        cabinet1: cabinet1Intervals,
        cabinet2: cabinet2Intervals,
      },
      freePairs: pairsByTime,
    });
  } catch (error) {
    console.error("Error getting available times:", error);
    res.status(500).json({ error: "Failed to get available times" });
  }
});

// Create patient and appointment
app.post("/api/book-appointment", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      email,
      appointmentDate,
      appointmentTime,
      gender = null,
      address = null,
      note = null,
    } = req.body;

    // Validate required fields
    if (
      !firstName ||
      !lastName ||
      !phone ||
      !appointmentDate ||
      !appointmentTime
    ) {
      return res.status(400).json({
        error:
          "Missing required fields: firstName, lastName, phone, appointmentDate, appointmentTime",
      });
    }

    // Validate date format
    if (!moment(appointmentDate, "YYYY-MM-DD", true).isValid()) {
      return res
        .status(400)
        .json({ error: "Invalid date format. Use YYYY-MM-DD" });
    }

    // Format phone number (remove non-numeric characters)
    const formattedPhone = phone.replace(/\D/g, "");

    // Create patient data
    const patientData = {
      firstname: firstName,
      lastname: lastName,
      phone: formattedPhone,
      email: email || null,
      gender: gender,
      address: address,
      note:
        note ||
        `Запис створено через веб-сайт ${moment().format("YYYY-MM-DD HH:mm")}`,
      date_created: moment().format("YYYY-MM-DD"),
      preferred_contact: "PHONE",
    };

    // Create patient in CRM
    const patientResponse = await makeCRMRequest(
      "/patients",
      "POST",
      patientData
    );
    // Robust patient id extraction across possible response shapes
    let patientId = null;
    if (patientResponse) {
      if (patientResponse.data?.patient_id)
        patientId = String(patientResponse.data.patient_id);
      else if (patientResponse.data?.id)
        patientId = String(patientResponse.data.id);
      else if (
        Array.isArray(patientResponse.data) &&
        patientResponse.data[0]?.patient_id
      )
        patientId = String(patientResponse.data[0].patient_id);
      else if (patientResponse.patient_id)
        patientId = String(patientResponse.patient_id);
      else if (patientResponse.id) patientId = String(patientResponse.id);
    }

    if (!patientId) {
      console.error("Create patient - unexpected response:", patientResponse);
      throw new Error("Failed to get patient ID from CRM response");
    }

    // Check which cabinet is available for the selected time
    const visitsResponse = await makeCRMRequest(
      `/visits?from=${appointmentDate}&to=${appointmentDate}`
    );
    const existingVisits = visitsResponse.data || [];

    // Find available doctor+cabinet pair for the selected time (consider interval overlaps)
    const occupiedByCabinet = {
      [DEFAULT_CONFIG.cabinet1Id]: new Set(),
      [DEFAULT_CONFIG.cabinet2Id]: new Set(),
    };
    const occupiedByDoctor = {};
    if (DEFAULT_CONFIG.doctor1Id)
      occupiedByDoctor[DEFAULT_CONFIG.doctor1Id] = new Set();
    if (DEFAULT_CONFIG.doctor2Id)
      occupiedByDoctor[DEFAULT_CONFIG.doctor2Id] = new Set();

    function overlapsForDate(dateStr, slotStartStr, vStartStr, vEndStr) {
      const s = moment(`${dateStr} ${slotStartStr}`, "YYYY-MM-DD HH:mm");
      const e = s.clone().add(DEFAULT_CONFIG.appointmentDuration, "minutes");
      const vs = moment(`${dateStr} ${vStartStr}`, "YYYY-MM-DD HH:mm");
      const ve = vEndStr
        ? moment(`${dateStr} ${vEndStr}`, "YYYY-MM-DD HH:mm")
        : vs.clone().add(DEFAULT_CONFIG.appointmentDuration, "minutes");
      return s.isBefore(ve) && e.isAfter(vs);
    }

    const allSlotsForDay = generateTimeSlots(appointmentDate);
    existingVisits.forEach((v) => {
      // Extract time from visit_start/visit_end
      const vStartTime = v.visit_start
        ? v.visit_start.split(" ")[1]
        : v.time_start;
      const vEndTime = v.visit_end ? v.visit_end.split(" ")[1] : v.time_end;

      allSlotsForDay.forEach((slotStr) => {
        if (overlapsForDate(appointmentDate, slotStr, vStartTime, vEndTime)) {
          if (occupiedByCabinet[v.cabinet_id])
            occupiedByCabinet[v.cabinet_id].add(slotStr);
          if (occupiedByDoctor[v.doctor_id])
            occupiedByDoctor[v.doctor_id].add(slotStr);
        }
      });
    });

    const candidateCabinets = [
      DEFAULT_CONFIG.cabinet1Id,
      DEFAULT_CONFIG.cabinet2Id,
    ];
    const candidateDoctors = [
      DEFAULT_CONFIG.doctor1Id,
      DEFAULT_CONFIG.doctor2Id,
    ].filter(Boolean);

    let selectedCabinetId = null;
    let selectedDoctorId = null;
    outer: for (const cabId of candidateCabinets) {
      const cabFree =
        !occupiedByCabinet[cabId] ||
        !occupiedByCabinet[cabId].has(appointmentTime);
      if (!cabFree) continue;
      for (const docId of candidateDoctors) {
        const docFree =
          !occupiedByDoctor[docId] ||
          !occupiedByDoctor[docId].has(appointmentTime);
        if (docFree) {
          selectedCabinetId = cabId;
          selectedDoctorId = docId;
          break outer;
        }
      }
    }

    if (!selectedCabinetId || !selectedDoctorId) {
      throw new Error("Selected time slot is no longer available");
    }

    // Calculate end time
    const startTime = moment(
      `${appointmentDate} ${appointmentTime}`,
      "YYYY-MM-DD HH:mm"
    );
    const endTime = startTime
      .clone()
      .add(DEFAULT_CONFIG.appointmentDuration, "minutes");

    // Create visit data
    const visitData = {
      status: "PLANNED",
      patient_id: patientId,
      cabinet_id: selectedCabinetId,
      doctor_id: selectedDoctorId,
      note: `Запис через веб-сайт. Пацієнт: ${firstName} ${lastName}, тел: ${phone}, email: ${email}`,
      date: appointmentDate,
      time_start: appointmentTime,
      time_end: endTime.format("HH:mm"),
    };

    // Create visit in CRM
    const visitResponse = await makeCRMRequest("/visits", "POST", visitData);

    res.json({
      success: true,
      message: "Appointment booked successfully",
      data: {
        patientId,
        visitId:
          visitResponse.data?.visit_id ||
          visitResponse.data?.id ||
          visitResponse.visit_id ||
          visitResponse.id,
        cabinetId: selectedCabinetId,
        doctorId: selectedDoctorId,
        appointmentDate,
        appointmentTime,
        endTime: endTime.format("HH:mm"),
      },
    });
  } catch (error) {
    console.error("Error booking appointment:", error);
    res.status(500).json({
      error: "Failed to book appointment",
      details: error.message,
    });
  }
});

// Get cabinets
app.get("/api/cabinets", async (req, res) => {
  try {
    const cabinetsResponse = await makeCRMRequest("/cabinets");
    res.json(cabinetsResponse);
  } catch (error) {
    console.error("Error getting cabinets:", error);
    res.status(500).json({ error: "Failed to get cabinets" });
  }
});

// Get staff (doctors list)
app.get("/api/staff", async (req, res) => {
  try {
    const staffResponse = await makeCRMRequest("/staff");
    res.json(staffResponse);
  } catch (error) {
    console.error("Error getting staff:", error);
    res.status(500).json({ error: "Failed to get staff" });
  }
});

// Get schedule spaces proxy (optional for debugging)
app.get("/api/schedule-spaces", async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to)
      return res
        .status(400)
        .json({ error: "from and to are required (YYYY-MM-DD)" });
    const spacesResponse = await makeCRMRequest(
      `/schedule-spaces?from=${from}&to=${to}`
    );
    res.json(spacesResponse);
  } catch (error) {
    console.error("Error getting schedule spaces:", error);
    res.status(500).json({ error: "Failed to get schedule spaces" });
  }
});

// Get patient by ID
app.get("/api/patients/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const response = await makeCRMRequest(`/patients/${id}`);
    res.json(response);
  } catch (error) {
    console.error("Error getting patient:", error);
    res.status(500).json({ error: "Failed to get patient" });
  }
});

// Get visits proxy
app.get("/api/visits", async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to)
      return res
        .status(400)
        .json({ error: "from and to are required (YYYY-MM-DD)" });
    const visitsResponse = await makeCRMRequest(
      `/visits?from=${from}&to=${to}`
    );
    res.json(visitsResponse);
  } catch (error) {
    console.error("Error getting visits:", error);
    res.status(500).json({ error: "Failed to get visits" });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    crmConnected: !!CRM_CONFIG.token,
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
app.listen(PORT, () => {
  console.log(`Dental appointment server running on port ${PORT}`);
  console.log(`CRM API Base URL: ${CRM_CONFIG.baseURL}`);
  console.log(`Default Doctor ID: ${DEFAULT_CONFIG.doctorId}`);
  console.log(
    `Cabinet IDs: ${DEFAULT_CONFIG.cabinet1Id}, ${DEFAULT_CONFIG.cabinet2Id}`
  );
});

module.exports = app;
