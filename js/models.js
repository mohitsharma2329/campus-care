(function (global) {
  const ComplaintCategory = {
    ELECTRICITY: { key: "ELECTRICITY", label: "Electricity" },
    WATER: { key: "WATER", label: "Water" },
    CLEANLINESS: { key: "CLEANLINESS", label: "Cleanliness" },
    FURNITURE: { key: "FURNITURE", label: "Furniture" },
    INTERNET: { key: "INTERNET", label: "Internet" },
    OTHER: { key: "OTHER", label: "Other" }
  };

  const Priority = {
    HIGH: { key: "HIGH", label: "High", weight: 3 },
    MEDIUM: { key: "MEDIUM", label: "Medium", weight: 2 },
    LOW: { key: "LOW", label: "Low", weight: 1 }
  };

  const ComplaintStatus = {
    PENDING: { key: "PENDING", label: "Pending" },
    IN_PROGRESS: { key: "IN_PROGRESS", label: "In Progress" },
    RESOLVED: { key: "RESOLVED", label: "Resolved" }
  };

  const UserRole = {
    STUDENT: "STUDENT",
    ADMIN: "ADMIN"
  };

  const DataMode = {
    DEMO: "DEMO",
    REAL: "REAL"
  };

  function defaultDemoComplaints() {
    return [
      {
        id: "CC-2026-1041",
        title: "Ceiling projector flickering & loose power cable",
        description: "Main ceiling projector in Lecture Hall B-204 cuts out every 5 minutes and shows an amber lamp warning during morning lectures.",
        category: "ELECTRICITY",
        building: "Science Block",
        classroom: "Hall B-204",
        priority: "HIGH",
        status: "IN_PROGRESS",
        submittedBy: "Aarav Mehta",
        reporterId: "STU-2026-0412",
        createdAt: "Nov 14, 2026 · 09:15",
        updatedAt: "Nov 15, 2026 · 14:20",
        photoUri: null,
        adminResponse: "AV technician inspected wiring harness. Replacement ballast ordered and scheduled for afternoon installation.",
        isDemo: true,
        timeline: [
          {
            title: "Complaint Submitted",
            note: "Reported by Aarav Mehta (Science Block · Hall B-204).",
            timestamp: "Nov 14, 2026 · 09:15",
            status: "PENDING"
          },
          {
            title: "Assigned to Electrical & AV Team",
            note: "AV technician inspected wiring harness and ordered replacement ballast.",
            timestamp: "Nov 15, 2026 · 14:20",
            status: "IN_PROGRESS"
          }
        ]
      },
      {
        id: "CC-2026-1042",
        title: "Drinking water dispenser leaking onto corridor floor",
        description: "Continuous water leakage from the chiller drain valve outside Room 203 creates a slip hazard between classes.",
        category: "WATER",
        building: "Engineering Wing",
        classroom: "Corridor 203",
        priority: "HIGH",
        status: "PENDING",
        submittedBy: "Priya Nair",
        reporterId: "STU-2026-0891",
        createdAt: "Nov 16, 2026 · 11:40",
        updatedAt: "Nov 16, 2026 · 11:40",
        photoUri: null,
        adminResponse: "",
        isDemo: true,
        timeline: [
          {
            title: "Complaint Submitted",
            note: "Flagged as High Priority slip hazard near Engineering Wing Corridor 203.",
            timestamp: "Nov 16, 2026 · 11:40",
            status: "PENDING"
          }
        ]
      },
      {
        id: "CC-2026-1043",
        title: "Dead Wi-Fi access point in Central Library 2F",
        description: "Students seated near the quiet study bays cannot connect to CampusNet-5G; signal drops completely after authentication.",
        category: "INTERNET",
        building: "Central Library",
        classroom: "2F Quiet Zone",
        priority: "HIGH",
        status: "PENDING",
        submittedBy: "Daniel Kim",
        reporterId: "STU-2026-0194",
        createdAt: "Nov 16, 2026 · 16:05",
        updatedAt: "Nov 16, 2026 · 16:05",
        photoUri: null,
        adminResponse: "",
        isDemo: true,
        timeline: [
          {
            title: "Complaint Submitted",
            note: "Reported network outage in Central Library 2F Quiet Zone.",
            timestamp: "Nov 16, 2026 · 16:05",
            status: "PENDING"
          }
        ]
      },
      {
        id: "CC-2026-1044",
        title: "Broken desk hinges in rows 3 and 4",
        description: "Four tablet-arm chairs have loose mounting bolts and wobbling writing surfaces making note-taking difficult.",
        category: "FURNITURE",
        building: "Science Block",
        classroom: "Hall B-204",
        priority: "MEDIUM",
        status: "PENDING",
        submittedBy: "Maya Lin",
        reporterId: "STU-2026-0520",
        createdAt: "Nov 15, 2026 · 13:10",
        updatedAt: "Nov 15, 2026 · 13:10",
        photoUri: null,
        adminResponse: "",
        isDemo: true,
        timeline: [
          {
            title: "Complaint Submitted",
            note: "Reported furniture wear in Science Block · Hall B-204.",
            timestamp: "Nov 15, 2026 · 13:10",
            status: "PENDING"
          }
        ]
      },
      {
        id: "CC-2026-1045",
        title: "Restroom exhaust fan & sanitation refill needed",
        description: "Second floor men's restroom ventilation fan is off and soap dispensers are empty.",
        category: "CLEANLINESS",
        building: "Engineering Wing",
        classroom: "Corridor 203",
        priority: "MEDIUM",
        status: "RESOLVED",
        submittedBy: "Lucas Rossi",
        reporterId: "STU-2026-0733",
        createdAt: "Nov 12, 2026 · 08:50",
        updatedAt: "Nov 13, 2026 · 10:15",
        photoUri: null,
        adminResponse: "Custodial team sanitized restroom, refilled dispensers, and reset the ventilation relay.",
        isDemo: true,
        timeline: [
          {
            title: "Complaint Submitted",
            note: "Sanitation and airflow ticket logged.",
            timestamp: "Nov 12, 2026 · 08:50",
            status: "PENDING"
          },
          {
            title: "Housekeeping Dispatched",
            note: "Custodial supervisor assigned morning crew.",
            timestamp: "Nov 12, 2026 · 12:30",
            status: "IN_PROGRESS"
          },
          {
            title: "Issue Resolved",
            note: "Sanitized, restocked, and exhaust fan verified operational.",
            timestamp: "Nov 13, 2026 · 10:15",
            status: "RESOLVED"
          }
        ]
      },
      {
        id: "CC-2026-1046",
        title: "Power outlet strip sparking near lab bench 6",
        description: "Wall surge protector strip flickers when oscilloscopes are plugged in. Needs electrician check.",
        category: "ELECTRICITY",
        building: "Science Block",
        classroom: "Hall B-204",
        priority: "LOW",
        status: "RESOLVED",
        submittedBy: "Sofia Patel",
        reporterId: "STU-2026-0611",
        createdAt: "Nov 10, 2026 · 15:25",
        updatedAt: "Nov 11, 2026 · 17:00",
        photoUri: null,
        adminResponse: "Replaced outlet strip with industrial-grade surge module and tested circuit breaker.",
        isDemo: true,
        timeline: [
          {
            title: "Complaint Submitted",
            note: "Logged outlet inspection request.",
            timestamp: "Nov 10, 2026 · 15:25",
            status: "PENDING"
          },
          {
            title: "Issue Resolved",
            note: "Replaced outlet strip and verified load safety.",
            timestamp: "Nov 11, 2026 · 17:00",
            status: "RESOLVED"
          }
        ]
      }
    ];
  }

  global.CampusCare = global.CampusCare || {};
  global.CampusCare.Models = {
    ComplaintCategory,
    Priority,
    ComplaintStatus,
    UserRole,
    DataMode,
    defaultDemoComplaints
  };
})(window);
