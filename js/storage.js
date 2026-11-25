(function (global) {
  const { ComplaintCategory, Priority, DataMode, defaultDemoComplaints } = global.CampusCare.Models;

  const KEY_DEMO_COMPLAINTS = "demo_complaints_v1";
  const KEY_REAL_COMPLAINTS = "real_complaints_v1";
  const KEY_SESSION = "campuscare_session_v1";
  const KEY_STUDENT_ACCOUNTS = "campuscare_student_accounts_v1";
  const KEY_LOCAL_ACTIVITY = "campuscare_local_activity_v1";

  const API_BASE = window.location.protocol.startsWith("http") ? "" : "http://127.0.0.1:8080";

  const backendState = {
    connected: false,
    dataDir: "Browser localStorage",
    files: null,
    onChange: null
  };

  function notifyBackendChange() {
    if (typeof backendState.onChange === "function") {
      backendState.onChange();
    }
  }

  function appendLocalActivity(action, detail) {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    let logs = [];
    try {
      const raw = localStorage.getItem(KEY_LOCAL_ACTIVITY);
      if (raw) logs = JSON.parse(raw) || [];
    } catch (_) {
      logs = [];
    }
    logs.unshift({ time: `${hh}:${mm}:${ss}`, action, detail });
    if (logs.length > 25) logs = logs.slice(0, 25);
    try {
      localStorage.setItem(KEY_LOCAL_ACTIVITY, JSON.stringify(logs));
    } catch (_) {}
  }

  async function apiFetch(path, options = {}, timeoutMs = 1500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        }
      });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  async function checkBackend() {
    try {
      const res = await apiFetch("/api/health", { method: "GET" }, 1200);
      if (!res.ok) throw new Error("Health failed");
      const info = await res.json();
      backendState.connected = Boolean(info && info.ok);
      backendState.dataDir = info.dataDir || "server/data";
      backendState.files = info.files || null;
      notifyBackendChange();
      return true;
    } catch (_) {
      backendState.connected = false;
      backendState.dataDir = "Browser localStorage (Start server for disk JSON)";
      backendState.files = null;
      notifyBackendChange();
      return false;
    }
  }

  function storageKey(mode) {
    return mode === DataMode.DEMO ? KEY_DEMO_COMPLAINTS : KEY_REAL_COMPLAINTS;
  }

  function loadComplaints(mode) {
    const key = storageKey(mode);
    const raw = localStorage.getItem(key);
    if (!raw) {
      if (mode === DataMode.DEMO) {
        const seeded = defaultDemoComplaints();
        saveLocalComplaints(DataMode.DEMO, seeded);
        return seeded;
      }
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("Invalid data");
      return parsed;
    } catch (_) {
      if (mode === DataMode.DEMO) {
        const seeded = defaultDemoComplaints();
        saveLocalComplaints(DataMode.DEMO, seeded);
        return seeded;
      }
      return [];
    }
  }

  function saveLocalComplaints(mode, complaints) {
    try {
      localStorage.setItem(storageKey(mode), JSON.stringify(complaints));
      return true;
    } catch (_) {
      return false;
    }
  }

  async function syncLoadComplaints(mode) {
    try {
      const res = await apiFetch(`/api/complaints?mode=${encodeURIComponent(mode)}`, { method: "GET" }, 1500);
      if (!res.ok) throw new Error("Load failed");
      const list = await res.json();
      if (Array.isArray(list)) {
        backendState.connected = true;
        saveLocalComplaints(mode, list);
        notifyBackendChange();
        return list;
      }
    } catch (_) {
      backendState.connected = false;
      notifyBackendChange();
    }
    return loadComplaints(mode);
  }

  function saveComplaints(mode, complaints) {
    const ok = saveLocalComplaints(mode, complaints);
    const fileLabel = mode === DataMode.DEMO ? "demo_complaints.json" : "real_complaints.json";
    appendLocalActivity("SAVE", `Saved ${complaints.length} record(s) -> ${fileLabel}`);

    apiFetch(`/api/complaints?mode=${encodeURIComponent(mode)}`, {
      method: "PUT",
      body: JSON.stringify(complaints)
    }, 2000)
      .then((res) => {
        if (res.ok) {
          backendState.connected = true;
        }
        notifyBackendChange();
      })
      .catch(() => {
        backendState.connected = false;
        notifyBackendChange();
      });

    return ok;
  }

  function resetDemoData() {
    const seeded = defaultDemoComplaints();
    saveLocalComplaints(DataMode.DEMO, seeded);
    appendLocalActivity("RESET", "Reset demo_complaints_v1 to 6 sample tickets");
    apiFetch("/api/complaints/reset-demo", { method: "POST" }, 1800)
      .then(() => {
        backendState.connected = true;
        notifyBackendChange();
      })
      .catch(() => notifyBackendChange());
    return seeded;
  }

  function clearRealData() {
    saveLocalComplaints(DataMode.REAL, []);
    appendLocalActivity("CLEAR", "Cleared real_complaints_v1");
    apiFetch("/api/complaints/real", { method: "DELETE" }, 1800)
      .then(() => {
        backendState.connected = true;
        notifyBackendChange();
      })
      .catch(() => notifyBackendChange());
    return [];
  }

  function loadSession() {
    const raw = sessionStorage.getItem(KEY_SESSION);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function saveSession(session) {
    if (!session) {
      sessionStorage.removeItem(KEY_SESSION);
    } else {
      sessionStorage.setItem(KEY_SESSION, JSON.stringify(session));
    }
  }

  function loadStudentAccounts() {
    const raw = localStorage.getItem(KEY_STUDENT_ACCOUNTS);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function verifyOrRegisterStudentLocal(studentId, displayName, password) {
    const pw = String(password || "");
    if (pw.length < 4) {
      return { ok: false, error: "Password must be at least 4 characters." };
    }
    const key = String(studentId || "").trim().toUpperCase();
    const accounts = loadStudentAccounts();
    const existing = accounts[key];
    const nowTime = new Date().toTimeString().slice(0, 8);
    if (existing) {
      if (existing.password !== pw) {
        appendLocalActivity("AUTH_FAIL", `Wrong password for ${key}`);
        return { ok: false, error: "Incorrect password for this Student ID." };
      }
      accounts[key] = { studentId: key, displayName: displayName || existing.displayName, password: pw, lastLogin: nowTime };
      try {
        localStorage.setItem(KEY_STUDENT_ACCOUNTS, JSON.stringify(accounts));
      } catch (_) {}
      appendLocalActivity("SIGN_IN", `Verified student ${key} -> campuscare_student_accounts_v1`);
      return { ok: true, isNew: false };
    }
    accounts[key] = { studentId: key, displayName, password: pw, lastLogin: nowTime };
    try {
      localStorage.setItem(KEY_STUDENT_ACCOUNTS, JSON.stringify(accounts));
    } catch (_) {}
    appendLocalActivity("REGISTER", `Saved new student ${key} -> campuscare_student_accounts_v1`);
    return { ok: true, isNew: true };
  }

  async function verifyOrRegisterStudent(studentId, displayName, password) {
    const pw = String(password || "");
    if (pw.length < 4) {
      return { ok: false, error: "Password must be at least 4 characters." };
    }

    try {
      const res = await apiFetch("/api/auth/student", {
        method: "POST",
        body: JSON.stringify({ studentId, displayName, password })
      }, 1800);
      const data = await res.json();
      backendState.connected = true;
      if (!res.ok || !data.ok) {
        notifyBackendChange();
        return { ok: false, error: data.error || "Sign-in failed." };
      }
      // Mirror locally too
      const key = String(studentId || "").trim().toUpperCase();
      const accounts = loadStudentAccounts();
      accounts[key] = {
        studentId: key,
        displayName,
        password: pw,
        lastLogin: new Date().toTimeString().slice(0, 8)
      };
      try {
        localStorage.setItem(KEY_STUDENT_ACCOUNTS, JSON.stringify(accounts));
      } catch (_) {}
      notifyBackendChange();
      return { ok: true, isNew: Boolean(data.isNew) };
    } catch (_) {
      backendState.connected = false;
      const localRes = verifyOrRegisterStudentLocal(studentId, displayName, password);
      notifyBackendChange();
      return localRes;
    }
  }

  async function fetchInspectorSnapshot() {
    try {
      const res = await apiFetch("/api/inspector", { method: "GET" }, 1500);
      if (!res.ok) throw new Error("Inspector failed");
      const data = await res.json();
      if (data && data.ok) {
        backendState.connected = true;
        backendState.dataDir = data.dataDir || backendState.dataDir;
        return { ...data, connected: true };
      }
    } catch (_) {
      backendState.connected = false;
    }

    const demoList = loadComplaints(DataMode.DEMO);
    const realList = loadComplaints(DataMode.REAL);
    const accountsObj = loadStudentAccounts();
    const safeAccounts = Object.entries(accountsObj).map(([k, v]) => ({
      studentId: k,
      displayName: (v && v.displayName) || "",
      lastLogin: (v && v.lastLogin) || "Local",
      passwordSet: true
    }));

    let logs = [];
    try {
      logs = JSON.parse(localStorage.getItem(KEY_LOCAL_ACTIVITY) || "[]");
    } catch (_) {
      logs = [];
    }

    return {
      ok: true,
      connected: false,
      dataDir: "Browser localStorage (run start-server.bat for disk files)",
      files: [
        { label: "Live Complaints", name: "real_complaints_v1", records: realList.length, bytes: JSON.stringify(realList).length },
        { label: "Demo Complaints", name: "demo_complaints_v1", records: demoList.length, bytes: JSON.stringify(demoList).length },
        { label: "Student Accounts", name: "campuscare_student_accounts_v1", records: safeAccounts.length, bytes: JSON.stringify(accountsObj).length }
      ],
      studentAccounts: safeAccounts,
      demoCount: demoList.length,
      realCount: realList.length,
      activityLog: logs
    };
  }

  async function exportAllDataJson() {
    const snap = await fetchInspectorSnapshot();
    const payload = {
      exportedAt: new Date().toISOString(),
      storageSource: snap.connected ? "Java Backend (server/data/*.json)" : "Browser localStorage",
      dataDir: snap.dataDir,
      liveComplaints: await syncLoadComplaints(DataMode.REAL),
      demoComplaints: await syncLoadComplaints(DataMode.DEMO),
      studentAccounts: snap.studentAccounts,
      activityLog: snap.activityLog
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campuscare-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function generateComplaintId(existing) {
    let maxSeq = 1040;
    existing.forEach((item) => {
      const parts = String(item.id || "").split("-");
      const num = parseInt(parts[parts.length - 1], 10);
      if (!Number.isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    });
    return `CC-2026-${maxSeq + 1}`;
  }

  function currentFormattedDate() {
    const d = new Date();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const mon = months[d.getMonth()];
    const day = String(d.getDate()).padStart(2, "0");
    const year = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${mon} ${day}, ${year} · ${hh}:${mm}`;
  }

  function computeSmartInsights(complaints) {
    const totalCount = complaints.length;
    const pendingCount = complaints.filter((c) => c.status === "PENDING").length;
    const inProgressCount = complaints.filter((c) => c.status === "IN_PROGRESS").length;
    const resolvedCount = complaints.filter((c) => c.status === "RESOLVED").length;
    const highPriorityUnresolvedCount = complaints.filter(
      (c) => c.priority === "HIGH" && c.status !== "RESOLVED"
    ).length;
    const resolutionRatePercent = totalCount === 0 ? 0 : Math.floor((resolvedCount * 100) / totalCount);

    const frequentCategories = Object.keys(ComplaintCategory)
      .map((catKey) => {
        const matching = complaints.filter((c) => c.category === catKey);
        return {
          category: catKey,
          label: ComplaintCategory[catKey].label,
          count: matching.length,
          unresolvedCount: matching.filter((c) => c.status !== "RESOLVED").length
        };
      })
      .filter((stat) => stat.count > 0)
      .sort((a, b) => b.count - a.count);

    const groupedLocations = new Map();
    complaints.forEach((c) => {
      const key = `${String(c.building || "").trim()} · ${String(c.classroom || "").trim()}`;
      if (!groupedLocations.has(key)) groupedLocations.set(key, []);
      groupedLocations.get(key).push(c);
    });

    const repeatedLocations = [];
    groupedLocations.forEach((group, locationKey) => {
      if (group.length >= 2) {
        const counts = {};
        group.forEach((item) => {
          counts[item.category] = (counts[item.category] || 0) + 1;
        });
        let topCat = "OTHER";
        let topCount = -1;
        Object.entries(counts).forEach(([cat, cnt]) => {
          if (cnt > topCount) {
            topCount = cnt;
            topCat = cat;
          }
        });
        repeatedLocations.push({
          locationKey,
          totalReports: group.length,
          unresolvedReports: group.filter((c) => c.status !== "RESOLVED").length,
          topCategory: topCat,
          topCategoryLabel: (ComplaintCategory[topCat] || ComplaintCategory.OTHER).label
        });
      }
    });
    repeatedLocations.sort((a, b) => b.totalReports - a.totalReports);

    const urgentQueue = complaints
      .filter((c) => c.status !== "RESOLVED")
      .slice()
      .sort((a, b) => {
        const wA = (Priority[a.priority] || Priority.LOW).weight;
        const wB = (Priority[b.priority] || Priority.LOW).weight;
        if (wB !== wA) return wB - wA;
        const inProgA = a.status === "IN_PROGRESS" ? 1 : 0;
        const inProgB = b.status === "IN_PROGRESS" ? 1 : 0;
        if (inProgA !== inProgB) return inProgA - inProgB;
        return b.id.localeCompare(a.id);
      });

    return {
      totalCount,
      pendingCount,
      inProgressCount,
      resolvedCount,
      highPriorityUnresolvedCount,
      resolutionRatePercent,
      frequentCategories,
      repeatedLocations,
      urgentQueue
    };
  }

  global.CampusCare = global.CampusCare || {};
  global.CampusCare.Storage = {
    backendState,
    checkBackend,
    loadComplaints,
    syncLoadComplaints,
    saveComplaints,
    resetDemoData,
    clearRealData,
    loadSession,
    saveSession,
    verifyOrRegisterStudent,
    fetchInspectorSnapshot,
    exportAllDataJson,
    generateComplaintId,
    currentFormattedDate,
    computeSmartInsights
  };
})(window);
