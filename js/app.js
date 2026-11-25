(function (global) {
  const { Icons } = global.CampusCare;
  const { ComplaintCategory, Priority, ComplaintStatus, UserRole, DataMode } = global.CampusCare.Models;
  const Storage = global.CampusCare.Storage;

  const Routes = {
    SPLASH: "splash",
    ROLE_SELECTION: "role_selection",
    STUDENT_DASHBOARD: "student_dashboard",
    REPORT_ISSUE: "report_issue",
    TRACK_COMPLAINTS: "track_complaints",
    ADMIN_DASHBOARD: "admin_dashboard",
    SMART_INSIGHTS: "smart_insights"
  };

  const state = {
    route: Routes.SPLASH,
    session: Storage.loadSession(),
    dataMode: DataMode.DEMO,
    complaints: [],
    insights: null,
    authRole: UserRole.STUDENT,
    authError: null,
    authDraft: { name: "", id: "", passcode: "", studentPassword: "", showPassword: false },
    reportDraft: {
      title: "",
      category: "ELECTRICITY",
      building: "",
      classroom: "",
      priority: "MEDIUM",
      description: "",
      photoUri: null,
      error: null
    },
    searchQuery: "",
    statusFilter: null,
    categoryFilter: null,
    priorityFilter: null,
    sortHighPriorityFirst: true,
    selectedComplaintId: null,
    adminEditDraft: null,
    asideOpen: window.innerWidth >= 980,
    inspectorSnap: null,
    splashTimer: null,
    snackbarTimer: null
  };

  // DOM References
  const topBar = document.getElementById("top-bar");
  const topBarLogo = document.getElementById("top-bar-logo");
  const topBarTitle = document.getElementById("top-bar-title");
  const topBarSubtitle = document.getElementById("top-bar-subtitle");
  const btnToggleAside = document.getElementById("btn-toggle-aside");
  const asideToggleDot = document.getElementById("aside-toggle-dot");
  const btnSwitchRole = document.getElementById("btn-switch-role");
  const switchRoleIcon = document.getElementById("switch-role-icon");
  const switchRoleLabel = document.getElementById("switch-role-label");
  const btnSignOut = document.getElementById("btn-signout");
  const mainContent = document.getElementById("main-content");
  const bottomNav = document.getElementById("bottom-nav");
  const dataAside = document.getElementById("data-aside");
  const snackbar = document.getElementById("snackbar");
  const snackbarMessage = document.getElementById("snackbar-message");
  const snackbarClose = document.getElementById("snackbar-close");
  const modalOverlay = document.getElementById("modal-overlay");
  const modalBody = document.getElementById("modal-body");
  const modalCloseBtn = document.getElementById("modal-close-btn");

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showSnackbar(message) {
    if (!message) return;
    clearTimeout(state.snackbarTimer);
    snackbarMessage.textContent = message;
    snackbar.classList.remove("hidden");
    state.snackbarTimer = setTimeout(() => {
      snackbar.classList.add("hidden");
    }, 4000);
  }

  snackbarClose.addEventListener("click", () => {
    clearTimeout(state.snackbarTimer);
    snackbar.classList.add("hidden");
  });

  function loadForMode(mode, session) {
    state.dataMode = mode;
    if (session !== undefined) {
      state.session = session;
      Storage.saveSession(session);
    }
    state.complaints = Storage.loadComplaints(mode);
    state.insights = Storage.computeSmartInsights(state.complaints);

    Storage.syncLoadComplaints(mode).then((synced) => {
      if (state.dataMode === mode && Array.isArray(synced)) {
        const changed = JSON.stringify(synced) !== JSON.stringify(state.complaints);
        if (changed) {
          state.complaints = synced;
          state.insights = Storage.computeSmartInsights(synced);
          render();
        } else {
          refreshDataAside();
        }
      }
    });
  }

  function filteredComplaints() {
    const query = state.searchQuery.trim().toLowerCase();
    const filtered = state.complaints.filter((item) => {
      const matchesQuery =
        !query ||
        item.id.toLowerCase().includes(query) ||
        item.title.toLowerCase().includes(query) ||
        item.building.toLowerCase().includes(query) ||
        item.classroom.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.submittedBy.toLowerCase().includes(query);
      const matchesStatus = !state.statusFilter || item.status === state.statusFilter;
      const matchesCategory = !state.categoryFilter || item.category === state.categoryFilter;
      const matchesPriority = !state.priorityFilter || item.priority === state.priorityFilter;
      return matchesQuery && matchesStatus && matchesCategory && matchesPriority;
    });

    const seqNum = (id) => {
      const num = parseInt(String(id || "").split("-").pop(), 10);
      return Number.isNaN(num) ? 0 : num;
    };

    if (state.sortHighPriorityFirst) {
      return filtered.slice().sort((a, b) => {
        const resA = a.status === "RESOLVED" ? 1 : 0;
        const resB = b.status === "RESOLVED" ? 1 : 0;
        if (resA !== resB) return resA - resB;
        const wA = (Priority[a.priority] || Priority.LOW).weight;
        const wB = (Priority[b.priority] || Priority.LOW).weight;
        if (wB !== wA) return wB - wA;
        return seqNum(b.id) - seqNum(a.id);
      });
    }
    return filtered.slice().sort((a, b) => seqNum(b.id) - seqNum(a.id));
  }

  function navigate(route) {
    state.route = route;
    window.scrollTo({ top: 0, behavior: "instant" });
    render();
  }

  function statusBadgeHtml(statusKey) {
    const st = ComplaintStatus[statusKey] || ComplaintStatus.PENDING;
    if (statusKey === "IN_PROGRESS") {
      return `<span class="status-badge in-progress">${Icons.wrench}<span>${escapeHtml(st.label)}</span></span>`;
    }
    if (statusKey === "RESOLVED") {
      return `<span class="status-badge resolved">${Icons.checkCircle}<span>${escapeHtml(st.label)}</span></span>`;
    }
    return `<span class="status-badge pending">${Icons.clock}<span>${escapeHtml(st.label)}</span></span>`;
  }

  function priorityLabelHtml(priorityKey) {
    const pr = Priority[priorityKey] || Priority.MEDIUM;
    if (priorityKey === "HIGH") {
      return `<span class="priority-label high">${Icons.alertTriangle}<span>${escapeHtml(pr.label)} Priority</span></span>`;
    }
    if (priorityKey === "LOW") {
      return `<span class="priority-label low"><span>${escapeHtml(pr.label)} Priority</span></span>`;
    }
    return `<span class="priority-label medium"><span>${escapeHtml(pr.label)} Priority</span></span>`;
  }

  function modeBannerHtml() {
    const isDemo = state.dataMode === DataMode.DEMO;
    if (isDemo) {
      return `
        <div class="mode-banner demo">
          <span>Shared Demo Storage — Student &amp; Admin changes sync immediately.</span>
          <button type="button" class="mode-banner-link" data-action="switch-mode" data-mode="REAL">Switch to Live Data</button>
        </div>
      `;
    }
    return `
      <div class="mode-banner real">
        <span>Shared Live Storage — Student &amp; Admin changes persist locally.</span>
        <button type="button" class="mode-banner-link" data-action="switch-mode" data-mode="DEMO">Switch to Demo Data</button>
      </div>
    `;
  }

  function complaintCardHtml(c) {
    const catLabel = (ComplaintCategory[c.category] || ComplaintCategory.OTHER).label;
    return `
      <button type="button" class="complaint-card" data-open-complaint="${escapeHtml(c.id)}">
        <div class="complaint-card-header">
          <span class="complaint-id-cat">${escapeHtml(c.id)} · ${escapeHtml(catLabel)}</span>
          ${statusBadgeHtml(c.status)}
        </div>
        <div class="complaint-title">${escapeHtml(c.title)}</div>
        <div class="complaint-desc">${escapeHtml(c.description)}</div>
        <div class="complaint-card-footer">
          <span class="complaint-location">${Icons.pin}<span>${escapeHtml(c.building)} · ${escapeHtml(c.classroom)}</span></span>
          ${priorityLabelHtml(c.priority)}
        </div>
      </button>
    `;
  }

  function timelineHtml(events) {
    if (!events || !events.length) return `<p class="section-subheading">No timeline events yet.</p>`;
    return `
      <div class="timeline">
        ${events
          .map((ev, idx) => {
            const dotClass =
              ev.status === "IN_PROGRESS" ? "in-progress" : ev.status === "RESOLVED" ? "resolved" : "pending";
            const line = idx < events.length - 1 ? `<div class="timeline-line"></div>` : "";
            return `
              <div class="timeline-item">
                <div class="timeline-rail">
                  <div class="timeline-dot ${dotClass}"></div>
                  ${line}
                </div>
                <div class="timeline-content">
                  <div class="timeline-title">${escapeHtml(ev.title)}</div>
                  <div class="timeline-note">${escapeHtml(ev.note)}</div>
                  <div class="timeline-time">${escapeHtml(ev.timestamp)}</div>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderChrome() {
    const showChrome = state.route !== Routes.SPLASH && state.route !== Routes.ROLE_SELECTION && state.session;
    if (!showChrome) {
      topBar.classList.add("hidden");
      bottomNav.classList.add("hidden");
      return;
    }

    topBar.classList.remove("hidden");
    bottomNav.classList.remove("hidden");

    const isAdmin = state.session.role === UserRole.ADMIN;
    const modeTag = state.dataMode === DataMode.DEMO ? "Demo" : "Live";

    topBarLogo.innerHTML = Icons.logo(38);
    topBarTitle.textContent = isAdmin ? "CampusCare Admin" : "CampusCare";
    topBarSubtitle.textContent = `${state.session.displayName} · ${modeTag}`;
    switchRoleIcon.innerHTML = Icons.switchArrows;
    switchRoleLabel.textContent = isAdmin ? "Student View" : "Admin Panel";
    btnSignOut.innerHTML = Icons.logout;

    const tabs = isAdmin
      ? [
          { route: Routes.ADMIN_DASHBOARD, label: "Admin", icon: Icons.admin },
          { route: Routes.TRACK_COMPLAINTS, label: "Track", icon: Icons.search },
          { route: Routes.REPORT_ISSUE, label: "New Ticket", icon: Icons.report },
          { route: Routes.SMART_INSIGHTS, label: "Insights", icon: Icons.insights }
        ]
      : [
          { route: Routes.STUDENT_DASHBOARD, label: "Home", icon: Icons.home },
          { route: Routes.REPORT_ISSUE, label: "Report", icon: Icons.report },
          { route: Routes.TRACK_COMPLAINTS, label: "Track", icon: Icons.search },
          { route: Routes.SMART_INSIGHTS, label: "Insights", icon: Icons.insights }
        ];

    bottomNav.innerHTML = tabs
      .map(
        (t) => `
          <button type="button" class="nav-item ${state.route === t.route ? "active" : ""}" data-nav="${t.route}">
            ${t.icon}
            <span>${t.label}</span>
          </button>
        `
      )
      .join("");

    bottomNav.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigate(btn.getAttribute("data-nav"));
      });
    });
  }

  function renderSplash() {
    clearTimeout(state.splashTimer);
    mainContent.innerHTML = `
      <section class="splash-screen">
        <div class="splash-brand">
          ${Icons.logo(96)}
          <h1 class="splash-title">CampusCare</h1>
          <p class="splash-tagline">Smart Campus Problem Solver</p>
        </div>
        <div class="splash-spinner" aria-label="Loading"></div>
        <button id="btn-splash-continue" class="splash-continue" type="button">Continue</button>
      </section>
    `;

    const finishSplash = () => {
      clearTimeout(state.splashTimer);
      if (state.session) {
        loadForMode(state.session.isDemoSession ? DataMode.DEMO : DataMode.REAL, state.session);
        navigate(state.session.role === UserRole.ADMIN ? Routes.ADMIN_DASHBOARD : Routes.STUDENT_DASHBOARD);
      } else {
        navigate(Routes.ROLE_SELECTION);
      }
    };

    document.getElementById("btn-splash-continue").addEventListener("click", finishSplash);
    state.splashTimer = setTimeout(finishSplash, 1450);
  }

  function renderRoleSelection() {
    const isAdmin = state.authRole === UserRole.ADMIN;
    mainContent.innerHTML = `
      <section class="auth-screen">
        <div class="auth-header">
          ${Icons.logo(66)}
          <h1>Welcome to CampusCare</h1>
          <p>Report maintenance issues, track resolution timelines, and manage campus repairs.</p>
        </div>

        <div class="segmented-control" role="tablist">
          <button type="button" class="segmented-btn ${!isAdmin ? "active" : ""}" data-auth-role="${UserRole.STUDENT}">
            ${Icons.student}
            <span>Student Portal</span>
          </button>
          <button type="button" class="segmented-btn ${isAdmin ? "active" : ""}" data-auth-role="${UserRole.ADMIN}">
            ${Icons.admin}
            <span>Admin Portal</span>
          </button>
        </div>

        <div class="card card-lg">
          <form id="auth-form" class="form-stack" novalidate>
            <div>
              <div class="card-title">${isAdmin ? "Facilities Administrator Sign In" : "Student Sign In"}</div>
              <p class="section-subheading">Student &amp; Admin portals share the exact same persistent local storage.</p>
            </div>

            <div class="field-group">
              <label class="field-label" for="auth-name">Full Name</label>
              <input
                id="auth-name"
                class="input-control"
                type="text"
                placeholder="${isAdmin ? "e.g., Ramesh Verma" : "e.g., Mohit Sharma"}"
                value="${escapeHtml(state.authDraft.name)}"
                autocomplete="name"
              />
            </div>

            <div class="field-group">
              <label class="field-label" for="auth-id">${isAdmin ? "Staff ID" : "Student ID / Roll No"}</label>
              <input
                id="auth-id"
                class="input-control"
                type="text"
                placeholder="${isAdmin ? "e.g., Vib-312" : "e.g., 25BCAN0190"}"
                value="${escapeHtml(state.authDraft.id)}"
              />
            </div>

            ${
              isAdmin
                ? `
              <div class="field-group">
                <label class="field-label" for="auth-passcode">Admin Passcode (use: admin123)</label>
                <div class="password-wrap">
                  <input
                    id="auth-passcode"
                    class="input-control"
                    type="${state.authDraft.showPassword ? "text" : "password"}"
                    placeholder="Enter admin123"
                    value="${escapeHtml(state.authDraft.passcode)}"
                  />
                  <button id="btn-toggle-pw" type="button" class="pw-toggle-btn">${state.authDraft.showPassword ? "Hide" : "Show"}</button>
                </div>
              </div>
            `
                : `
              <div class="field-group">
                <label class="field-label" for="auth-student-pw">Password</label>
                <div class="password-wrap">
                  <input
                    id="auth-student-pw"
                    class="input-control"
                    type="${state.authDraft.showPassword ? "text" : "password"}"
                    placeholder="Enter password (min. 4 characters)"
                    value="${escapeHtml(state.authDraft.studentPassword)}"
                    autocomplete="current-password"
                  />
                  <button id="btn-toggle-pw" type="button" class="pw-toggle-btn">${state.authDraft.showPassword ? "Hide" : "Show"}</button>
                </div>
                <span class="section-subheading" style="margin-top:2px;">First-time Student IDs register this password locally; returning IDs verify it.</span>
              </div>
            `
            }

            ${state.authError ? `<div class="error-text">${escapeHtml(state.authError)}</div>` : ""}

            <button type="submit" class="btn btn-primary btn-full">Sign In to Live Campus Storage</button>

            <div class="divider-label">OR INSTANT DEMO SANDBOX</div>

            <button id="btn-demo-login" type="button" class="btn btn-outline btn-full">
              ${isAdmin ? "Enter Admin Demo Mode" : "Enter Student Demo Mode"}
            </button>
          </form>
        </div>

        <p class="section-subheading" style="text-align:center;">
          Demo Mode uses isolated sample complaints; Live Storage keeps real student &amp; admin submissions separate.
        </p>

        <button id="btn-auth-open-aside" type="button" class="btn btn-outline-neutral" style="height:38px;font-size:12.5px;">
          ${Icons.database}
          <span>${state.asideOpen ? "Hide Backend & Data Flow" : "View Where All Data Goes"}</span>
        </button>
      </section>
    `;

    document.getElementById("btn-auth-open-aside").addEventListener("click", () => {
      state.asideOpen = !state.asideOpen;
      render();
    });

    mainContent.querySelectorAll("[data-auth-role]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.authRole = btn.getAttribute("data-auth-role");
        state.authError = null;
        renderRoleSelection();
      });
    });

    const nameEl = document.getElementById("auth-name");
    const idEl = document.getElementById("auth-id");
    const passEl = document.getElementById("auth-passcode");
    const studentPwEl = document.getElementById("auth-student-pw");
    const togglePwBtn = document.getElementById("btn-toggle-pw");

    nameEl.addEventListener("input", (e) => {
      state.authDraft.name = e.target.value;
    });
    idEl.addEventListener("input", (e) => {
      state.authDraft.id = e.target.value;
    });
    if (passEl) {
      passEl.addEventListener("input", (e) => {
        state.authDraft.passcode = e.target.value;
      });
    }
    if (studentPwEl) {
      studentPwEl.addEventListener("input", (e) => {
        state.authDraft.studentPassword = e.target.value;
      });
    }
    if (togglePwBtn) {
      togglePwBtn.addEventListener("click", () => {
        state.authDraft.showPassword = !state.authDraft.showPassword;
        renderRoleSelection();
      });
    }

    document.getElementById("auth-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = state.authDraft.name.trim();
      const id = state.authDraft.id.trim();
      if (name.length < 2 || id.length < 3) {
        state.authError = "Please enter your name and valid campus ID.";
        renderRoleSelection();
        return;
      }
      let toastMsg = "Signed in to shared Live Campus Storage.";
      if (isAdmin) {
        if (state.authDraft.passcode !== "admin123") {
          state.authError = "Invalid passcode. Enter 'admin123' or use Demo Mode.";
          renderRoleSelection();
          return;
        }
      } else {
        const pwCheck = await Storage.verifyOrRegisterStudent(id, name, state.authDraft.studentPassword);
        if (!pwCheck.ok) {
          state.authError = pwCheck.error;
          renderRoleSelection();
          return;
        }
        if (pwCheck.isNew) {
          toastMsg = "Student account saved & signed in to Live Campus Storage.";
        }
      }
      const session = {
        role: isAdmin ? UserRole.ADMIN : UserRole.STUDENT,
        displayName: name,
        identifier: id,
        isDemoSession: false
      };
      state.authError = null;
      loadForMode(DataMode.REAL, session);
      showSnackbar(toastMsg);
      navigate(isAdmin ? Routes.ADMIN_DASHBOARD : Routes.STUDENT_DASHBOARD);
    });

    document.getElementById("btn-demo-login").addEventListener("click", () => {
      const session = isAdmin
        ? {
            role: UserRole.ADMIN,
            displayName: "Facilities Lead (Demo)",
            identifier: "ADM-DEMO-01",
            isDemoSession: true
          }
        : {
            role: UserRole.STUDENT,
            displayName: state.authDraft.name.trim() || "Mohit Sharma",
            identifier: state.authDraft.id.trim() || "25BCAN0190",
            isDemoSession: true
          };
      state.authError = null;
      loadForMode(DataMode.DEMO, session);
      showSnackbar("Entered Demo Sandbox mode.");
      navigate(isAdmin ? Routes.ADMIN_DASHBOARD : Routes.STUDENT_DASHBOARD);
    });
  }

  function renderStudentDashboard() {
    const ins = state.insights;
    const recent = state.complaints.slice(0, 5);

    mainContent.innerHTML = `
      <section class="page-container">
        ${modeBannerHtml()}

        <div>
          <h1 class="section-heading">Hello, ${escapeHtml(state.session.displayName)}</h1>
          <p class="section-subheading">${escapeHtml(state.session.identifier)} · Student Maintenance Dashboard</p>
        </div>

        <div class="stats-grid-2">
          <div class="stat-card">
            <div class="stat-top">
              <span class="stat-label">Total</span>
              <span class="stat-icon-badge" style="background:rgba(21,101,192,0.12);color:#1565C0;">${Icons.assignment}</span>
            </div>
            <div class="stat-value">${ins.totalCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-top">
              <span class="stat-label">Pending</span>
              <span class="stat-icon-badge" style="background:rgba(194,65,12,0.12);color:#C2410C;">${Icons.clock}</span>
            </div>
            <div class="stat-value">${ins.pendingCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-top">
              <span class="stat-label">In Progress</span>
              <span class="stat-icon-badge" style="background:rgba(29,78,216,0.12);color:#1D4ED8;">${Icons.wrench}</span>
            </div>
            <div class="stat-value">${ins.inProgressCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-top">
              <span class="stat-label">Resolved</span>
              <span class="stat-icon-badge" style="background:rgba(21,128,61,0.12);color:#15803D;">${Icons.checkCircle}</span>
            </div>
            <div class="stat-value">${ins.resolvedCount}</div>
          </div>
        </div>

        <div class="form-row-2">
          <button id="btn-dash-report" type="button" class="btn btn-primary">
            ${Icons.report}
            <span>Report Issue</span>
          </button>
          <button id="btn-dash-track" type="button" class="btn btn-outline">
            ${Icons.search}
            <span>Track Complaints</span>
          </button>
        </div>

        ${
          ins.repeatedLocations.length
            ? `
          <div class="card">
            <div class="row-between" style="margin-bottom:6px;">
              <div style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:15px;">
                <span style="color:#DC2626;display:flex;">${Icons.flame}</span>
                <span>Repeated Location Hotspots</span>
              </div>
              <button type="button" class="btn-text" data-go-route="${Routes.SMART_INSIGHTS}">View Analytics</button>
            </div>
            ${ins.repeatedLocations
              .slice(0, 3)
              .map(
                (spot) => `
                <div class="hotspot-row">
                  <span style="color:var(--text-secondary);">${escapeHtml(spot.locationKey)} · ${escapeHtml(spot.topCategoryLabel)}</span>
                  <span class="hotspot-count">${spot.totalReports} reports</span>
                </div>
              `
              )
              .join("")}
          </div>
        `
            : ""
        }

        <div class="row-between">
          <h2 class="card-title">Recent Complaints</h2>
          <button type="button" class="btn-text" data-go-route="${Routes.TRACK_COMPLAINTS}">See all (${state.complaints.length})</button>
        </div>

        <div class="complaint-list">
          ${
            recent.length
              ? recent.map(complaintCardHtml).join("")
              : `
            <div class="card">
              <div class="card-title">No complaints submitted yet</div>
              <p class="section-subheading" style="margin-top:4px;">
                Tap Report Issue to log your first ${state.dataMode === DataMode.DEMO ? "demo" : "live"} campus maintenance request.
              </p>
            </div>
          `
          }
        </div>
      </section>
    `;

    document.getElementById("btn-dash-report").addEventListener("click", () => navigate(Routes.REPORT_ISSUE));
    document.getElementById("btn-dash-track").addEventListener("click", () => navigate(Routes.TRACK_COMPLAINTS));
    wireCommonEvents();
  }

  function renderReportIssue() {
    const d = state.reportDraft;
    const isDemo = state.dataMode === DataMode.DEMO;

    mainContent.innerHTML = `
      <section class="page-container">
        ${modeBannerHtml()}

        <div class="card card-lg">
          <form id="report-form" class="form-stack" novalidate>
            <div>
              <h1 class="section-heading">Report a Campus Issue</h1>
              <p class="section-subheading">Creates a persistent ticket in ${isDemo ? "Demo Sandbox" : "Live Storage"}.</p>
            </div>

            <div class="field-group">
              <label class="field-label" for="rep-title">Issue Title *</label>
              <input id="rep-title" class="input-control" type="text" placeholder="e.g., Watercooler not working" value="${escapeHtml(d.title)}" />
            </div>

            <div class="field-group">
              <span class="field-label">Category *</span>
              <div class="chips-wrap" id="rep-categories">
                ${Object.values(ComplaintCategory)
                  .map(
                    (cat) => `
                  <button type="button" class="chip ${d.category === cat.key ? "selected" : ""}" data-rep-cat="${cat.key}">
                    ${Icons.category(cat.key)}
                    <span>${escapeHtml(cat.label)}</span>
                  </button>
                `
                  )
                  .join("")}
              </div>
            </div>

            <div class="form-row-2">
              <div class="field-group">
                <label class="field-label" for="rep-building">Building *</label>
                <input id="rep-building" class="input-control" type="text" placeholder="Engineering Block" value="${escapeHtml(d.building)}" />
              </div>
              <div class="field-group">
                <label class="field-label" for="rep-room">Classroom / Exact Area *</label>
                <input id="rep-room" class="input-control" type="text" placeholder="Vib 502" value="${escapeHtml(d.classroom)}" />
              </div>
            </div>

            <div class="field-group">
              <span class="field-label">Priority Level *</span>
              <div class="segmented-control">
                ${["LOW", "MEDIUM", "HIGH"]
                  .map((pKey) => {
                    const pr = Priority[pKey];
                    return `
                      <button
                        type="button"
                        class="segmented-btn priority-${pKey.toLowerCase()} ${d.priority === pKey ? "active" : ""}"
                        data-rep-priority="${pKey}"
                      >${escapeHtml(pr.label)}</button>
                    `;
                  })
                  .join("")}
              </div>
            </div>

            <div class="field-group">
              <label class="field-label" for="rep-desc">Description *</label>
              <textarea id="rep-desc" class="textarea-control" placeholder="Describe what is broken and its impact on classes...">${escapeHtml(d.description)}</textarea>
            </div>

            <div class="field-group">
              <input id="rep-photo-input" type="file" accept="image/*" class="hidden" />
              <button id="btn-rep-photo" type="button" class="btn btn-outline-neutral btn-full">
                ${Icons.camera}
                <span>${d.photoUri ? "Change Attached Photo" : "Attach Optional Photo"}</span>
              </button>
              ${
                d.photoUri
                  ? `
                <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">
                  <img src="${d.photoUri}" alt="Selected issue photo" class="photo-preview" />
                  <button id="btn-rep-remove-photo" type="button" class="btn-text" style="align-self:flex-end;color:var(--priority-high);">Remove Photo</button>
                </div>
              `
                  : ""
              }
            </div>

            ${d.error ? `<div class="error-text">${escapeHtml(d.error)}</div>` : ""}

            <button type="submit" class="btn btn-primary btn-full">Submit Maintenance Ticket</button>
          </form>
        </div>
      </section>
    `;

    document.getElementById("rep-title").addEventListener("input", (e) => {
      state.reportDraft.title = e.target.value;
      state.reportDraft.error = null;
    });
    document.getElementById("rep-building").addEventListener("input", (e) => {
      state.reportDraft.building = e.target.value;
      state.reportDraft.error = null;
    });
    document.getElementById("rep-room").addEventListener("input", (e) => {
      state.reportDraft.classroom = e.target.value;
      state.reportDraft.error = null;
    });
    document.getElementById("rep-desc").addEventListener("input", (e) => {
      state.reportDraft.description = e.target.value;
      state.reportDraft.error = null;
    });

    mainContent.querySelectorAll("[data-rep-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.reportDraft.category = btn.getAttribute("data-rep-cat");
        renderReportIssue();
      });
    });

    mainContent.querySelectorAll("[data-rep-priority]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.reportDraft.priority = btn.getAttribute("data-rep-priority");
        renderReportIssue();
      });
    });

    const photoInput = document.getElementById("rep-photo-input");
    document.getElementById("btn-rep-photo").addEventListener("click", () => photoInput.click());
    photoInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 960;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          state.reportDraft.photoUri = canvas.toDataURL("image/jpeg", 0.78);
          renderReportIssue();
        };
        img.onerror = () => {
          state.reportDraft.photoUri = reader.result;
          renderReportIssue();
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });

    const removePhotoBtn = document.getElementById("btn-rep-remove-photo");
    if (removePhotoBtn) {
      removePhotoBtn.addEventListener("click", () => {
        state.reportDraft.photoUri = null;
        renderReportIssue();
      });
    }

    document.getElementById("report-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const title = state.reportDraft.title.trim();
      const desc = state.reportDraft.description.trim();
      const building = state.reportDraft.building.trim();
      const classroom = state.reportDraft.classroom.trim();

      if (title.length < 5) {
        state.reportDraft.error = "Please enter a descriptive title (at least 5 characters).";
        renderReportIssue();
        return;
      }
      if (!building || !classroom) {
        state.reportDraft.error = "Both Building and Classroom/Location are required.";
        renderReportIssue();
        return;
      }
      if (desc.length < 12) {
        state.reportDraft.error = "Please describe the issue in detail (at least 12 characters).";
        renderReportIssue();
        return;
      }

      const now = Storage.currentFormattedDate();
      const newId = Storage.generateComplaintId(state.complaints);
      const reporterName = state.session ? state.session.displayName : "Campus Student";
      const reporterId = state.session ? state.session.identifier : "STU-LOCAL";

      const newComplaint = {
        id: newId,
        title,
        description: desc,
        category: state.reportDraft.category,
        building,
        classroom,
        priority: state.reportDraft.priority,
        status: "PENDING",
        submittedBy: reporterName,
        reporterId,
        createdAt: now,
        updatedAt: now,
        photoUri: state.reportDraft.photoUri,
        adminResponse: "",
        isDemo: state.dataMode === DataMode.DEMO,
        timeline: [
          {
            title: "Complaint Submitted",
            note: `Logged by ${reporterName} at ${building} · ${classroom}.`,
            timestamp: now,
            status: "PENDING"
          }
        ]
      };

      const updated = [newComplaint, ...state.complaints];
      Storage.saveComplaints(state.dataMode, updated);
      state.complaints = updated;
      state.insights = Storage.computeSmartInsights(updated);
      state.searchQuery = "";
      state.statusFilter = null;
      state.categoryFilter = null;
      state.priorityFilter = null;
      state.reportDraft = {
        title: "",
        category: "ELECTRICITY",
        building: "",
        classroom: "",
        priority: "MEDIUM",
        description: "",
        photoUri: null,
        error: null
      };

      showSnackbar(`Complaint ${newId} submitted successfully.`);
      navigate(Routes.TRACK_COMPLAINTS);
      openComplaintModal(newId);
    });

    wireCommonEvents();
  }

  function renderTrackListOnly() {
    const list = filteredComplaints();
    const countLabel = document.getElementById("track-count-label");
    const listWrap = document.getElementById("track-list-wrap");
    if (countLabel) {
      countLabel.textContent = `${list.length} of ${state.complaints.length} shown`;
    }
    if (listWrap) {
      listWrap.innerHTML = list.length
        ? list.map(complaintCardHtml).join("")
        : `
          <div class="card">
            <div class="card-title">No matching complaints</div>
            <p class="section-subheading" style="margin-top:4px;">Try clearing your search query or switching status filters.</p>
          </div>
        `;
      wireComplaintCardClicks(listWrap);
    }
  }

  function renderTrackComplaints() {
    const list = filteredComplaints();

    mainContent.innerHTML = `
      <section class="page-container">
        ${modeBannerHtml()}

        <div class="card form-stack">
          <div class="row-between">
            <h1 class="section-heading">Track Complaints</h1>
            <span id="track-count-label" class="section-subheading" style="margin-top:0;">${list.length} of ${state.complaints.length} shown</span>
          </div>

          <div class="search-box">
            <span class="search-box-icon">${Icons.search}</span>
            <input
              id="track-search"
              class="input-control"
              type="text"
              placeholder="Search by Ticket ID (CC-2026-...), building, or keyword"
              value="${escapeHtml(state.searchQuery)}"
            />
            <button id="track-search-clear" type="button" class="search-clear-btn ${state.searchQuery ? "" : "hidden"}" aria-label="Clear search">&times;</button>
          </div>

          <div class="segmented-control">
            <button type="button" class="segmented-btn ${!state.statusFilter ? "active" : ""}" data-status-filter="">All</button>
            ${Object.values(ComplaintStatus)
              .map(
                (st) => `
              <button type="button" class="segmented-btn ${state.statusFilter === st.key ? "active" : ""}" data-status-filter="${st.key}">
                ${escapeHtml(st.label)}
              </button>
            `
              )
              .join("")}
          </div>

          <div>
            <select id="track-cat-select" class="select-control" aria-label="Filter by category" style="max-width:190px;padding:8px 12px;font-size:13.5px;">
              <option value="" ${!state.categoryFilter ? "selected" : ""}>All Categories</option>
              ${Object.values(ComplaintCategory)
                .map(
                  (cat) => `
                <option value="${cat.key}" ${state.categoryFilter === cat.key ? "selected" : ""}>${escapeHtml(cat.label)}</option>
              `
                )
                .join("")}
            </select>
          </div>
        </div>

        <div id="track-list-wrap" class="complaint-list"></div>
      </section>
    `;

    renderTrackListOnly();

    const searchInput = document.getElementById("track-search");
    const clearBtn = document.getElementById("track-search-clear");

    searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value;
      clearBtn.classList.toggle("hidden", !state.searchQuery);
      renderTrackListOnly();
    });

    clearBtn.addEventListener("click", () => {
      state.searchQuery = "";
      searchInput.value = "";
      clearBtn.classList.add("hidden");
      renderTrackListOnly();
      searchInput.focus();
    });

    mainContent.querySelectorAll("[data-status-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.getAttribute("data-status-filter");
        state.statusFilter = val || null;
        renderTrackComplaints();
      });
    });

    document.getElementById("track-cat-select").addEventListener("change", (e) => {
      state.categoryFilter = e.target.value || null;
      renderTrackListOnly();
    });

    wireCommonEvents();
  }

  function renderAdminListOnly() {
    const list = filteredComplaints();
    const listWrap = document.getElementById("admin-list-wrap");
    if (!listWrap) return;

    if (!list.length) {
      listWrap.innerHTML = `
        <div class="card">
          <div class="card-title">No complaints match current filters</div>
          <button id="btn-admin-reset-filters" type="button" class="btn-text" style="padding-left:0;margin-top:6px;">Reset All Filters</button>
        </div>
      `;
      const resetBtn = document.getElementById("btn-admin-reset-filters");
      if (resetBtn) {
        resetBtn.addEventListener("click", () => {
          state.searchQuery = "";
          state.statusFilter = null;
          state.categoryFilter = null;
          state.priorityFilter = null;
          renderAdminDashboard();
        });
      }
      return;
    }

    listWrap.innerHTML = list.map(complaintCardHtml).join("");
    wireComplaintCardClicks(listWrap);
  }

  function renderAdminDashboard() {
    const ins = state.insights;

    mainContent.innerHTML = `
      <section class="page-container">
        ${modeBannerHtml()}

        <div>
          <h1 class="section-heading">Admin Panel &amp; Operations</h1>
          <p class="section-subheading">
            Total: ${ins.totalCount} · Resolution Rate: ${ins.resolutionRatePercent}% · High-Priority Open: ${ins.highPriorityUnresolvedCount}
          </p>
        </div>

        <div class="stats-grid-2">
          <div class="stat-card">
            <div class="stat-top">
              <span class="stat-label">Total</span>
              <span class="stat-icon-badge" style="background:rgba(21,101,192,0.12);color:#1565C0;">${Icons.assignment}</span>
            </div>
            <div class="stat-value">${ins.totalCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-top">
              <span class="stat-label">Urgent Open</span>
              <span class="stat-icon-badge" style="background:rgba(220,38,38,0.12);color:#DC2626;">${Icons.alertTriangle}</span>
            </div>
            <div class="stat-value" style="color:#DC2626;">${ins.highPriorityUnresolvedCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-top">
              <span class="stat-label">Pending</span>
              <span class="stat-icon-badge" style="background:rgba(194,65,12,0.12);color:#C2410C;">${Icons.clock}</span>
            </div>
            <div class="stat-value">${ins.pendingCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-top">
              <span class="stat-label">In Progress</span>
              <span class="stat-icon-badge" style="background:rgba(29,78,216,0.12);color:#1D4ED8;">${Icons.wrench}</span>
            </div>
            <div class="stat-value">${ins.inProgressCount}</div>
          </div>
          <div class="stat-card span-2">
            <div class="stat-top">
              <span class="stat-label">Resolved</span>
              <span class="stat-icon-badge" style="background:rgba(21,128,61,0.12);color:#15803D;">${Icons.checkCircle}</span>
            </div>
            <div class="stat-value" style="color:#15803D;">${ins.resolvedCount}</div>
          </div>
        </div>

        <div class="card form-stack">
          <div class="search-box">
            <span class="search-box-icon">${Icons.search}</span>
            <input
              id="admin-search"
              class="input-control"
              type="text"
              placeholder="Filter all complaints by Ticket ID, student, building..."
              value="${escapeHtml(state.searchQuery)}"
            />
            <button id="admin-search-clear" type="button" class="search-clear-btn ${state.searchQuery ? "" : "hidden"}" aria-label="Clear search">&times;</button>
          </div>

          <div class="segmented-control">
            <button type="button" class="segmented-btn ${!state.statusFilter ? "active" : ""}" data-admin-status="">All</button>
            ${Object.values(ComplaintStatus)
              .map(
                (st) => `
              <button type="button" class="segmented-btn ${state.statusFilter === st.key ? "active" : ""}" data-admin-status="${st.key}">
                ${escapeHtml(st.label)}
              </button>
            `
              )
              .join("")}
          </div>

          <div class="chips-scroll">
            <button type="button" class="chip ${!state.categoryFilter ? "selected" : ""}" data-admin-cat="">All Categories</button>
            ${Object.values(ComplaintCategory)
              .map(
                (cat) => `
              <button type="button" class="chip ${state.categoryFilter === cat.key ? "selected" : ""}" data-admin-cat="${cat.key}">
                ${escapeHtml(cat.label)}
              </button>
            `
              )
              .join("")}
          </div>

          <div class="chips-scroll">
            <button type="button" class="chip ${!state.priorityFilter ? "selected" : ""}" data-admin-priority="">All Priorities</button>
            ${Object.values(Priority)
              .map(
                (pr) => `
              <button type="button" class="chip ${state.priorityFilter === pr.key ? "selected" : ""}" data-admin-priority="${pr.key}">
                ${escapeHtml(pr.label)}
              </button>
            `
              )
              .join("")}
          </div>

          <div class="switch-row">
            <span style="font-size:13px;font-weight:500;">Prioritize unresolved high-priority first</span>
            <label class="switch">
              <input id="admin-priority-sort" type="checkbox" ${state.sortHighPriorityFirst ? "checked" : ""} />
              <span class="switch-slider"></span>
            </label>
          </div>
        </div>

        <div id="admin-list-wrap" class="complaint-list"></div>
      </section>
    `;

    renderAdminListOnly();

    const searchInput = document.getElementById("admin-search");
    const clearBtn = document.getElementById("admin-search-clear");

    searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value;
      clearBtn.classList.toggle("hidden", !state.searchQuery);
      renderAdminListOnly();
    });

    clearBtn.addEventListener("click", () => {
      state.searchQuery = "";
      searchInput.value = "";
      clearBtn.classList.add("hidden");
      renderAdminListOnly();
      searchInput.focus();
    });

    mainContent.querySelectorAll("[data-admin-status]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.statusFilter = btn.getAttribute("data-admin-status") || null;
        renderAdminDashboard();
      });
    });

    mainContent.querySelectorAll("[data-admin-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.categoryFilter = btn.getAttribute("data-admin-cat") || null;
        renderAdminDashboard();
      });
    });

    mainContent.querySelectorAll("[data-admin-priority]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.priorityFilter = btn.getAttribute("data-admin-priority") || null;
        renderAdminDashboard();
      });
    });

    document.getElementById("admin-priority-sort").addEventListener("change", (e) => {
      state.sortHighPriorityFirst = e.target.checked;
      renderAdminListOnly();
    });

    wireCommonEvents();
  }

  function renderSmartInsights() {
    const ins = state.insights;
    const maxCat = Math.max(1, ...ins.frequentCategories.map((c) => c.count));

    mainContent.innerHTML = `
      <section class="page-container">
        <div>
          <h1 class="section-heading">Smart Campus Insights</h1>
          <p class="section-subheading">Live analytics updated automatically from student submissions and admin status resolutions.</p>
        </div>

        <div class="card form-stack">
          <div class="row-between">
            <h2 class="card-title">Frequently Reported Categories</h2>
            <span class="section-subheading" style="margin-top:0;font-weight:600;">
              ${ins.totalCount} total · ${ins.resolutionRatePercent}% resolved
            </span>
          </div>
          ${
            ins.frequentCategories.length
              ? ins.frequentCategories
                  .map((stat) => {
                    const pct = Math.round((stat.count / maxCat) * 100);
                    return `
                    <div class="progress-row">
                      <div class="progress-header">
                        <span class="progress-label">
                          <span style="color:var(--campus-blue-primary);display:flex;">${Icons.category(stat.category)}</span>
                          <span>${escapeHtml(stat.label)}</span>
                        </span>
                        <span style="color:var(--text-secondary);">${stat.count} total · ${stat.unresolvedCount} open</span>
                      </div>
                      <div class="progress-track">
                        <div class="progress-fill" style="width:${pct}%"></div>
                      </div>
                    </div>
                  `;
                  })
                  .join("")
              : `<p class="section-subheading">No reports yet in this workspace.</p>`
          }
        </div>

        <div class="card form-stack">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="color:var(--campus-blue-primary);display:flex;">${Icons.building}</span>
            <h2 class="card-title">Repeated Complaints by Location</h2>
          </div>
          ${
            ins.repeatedLocations.length
              ? ins.repeatedLocations
                  .map(
                    (spot) => `
                  <div class="hotspot-row" style="border-top:1px solid var(--outline-hairline);padding-top:8px;">
                    <div>
                      <div style="font-weight:600;color:var(--text-primary);">${escapeHtml(spot.locationKey)}</div>
                      <div class="section-subheading" style="margin-top:1px;">Primary issue: ${escapeHtml(spot.topCategoryLabel)}</div>
                    </div>
                    <span class="hotspot-count">${spot.totalReports} reports</span>
                  </div>
                `
                  )
                  .join("")
              : `<p class="section-subheading">No repeated location hotspots (2+ complaints in the same room) detected yet.</p>`
          }
        </div>

        <div class="card form-stack">
          <h2 class="card-title">Priority Action Queue (Unresolved)</h2>
          ${
            ins.urgentQueue.length
              ? ins.urgentQueue
                  .slice(0, 5)
                  .map(
                    (item) => `
                  <button type="button" class="hotspot-row" data-open-complaint="${escapeHtml(item.id)}" style="background:none;border:none;border-top:1px solid var(--outline-hairline);width:100%;text-align:left;cursor:pointer;padding:10px 0 4px;">
                    <div style="min-width:0;">
                      <div style="font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item.title)}</div>
                      <div class="section-subheading" style="margin-top:2px;">${escapeHtml(item.id)} · ${escapeHtml(item.building)} · ${escapeHtml(item.classroom)}</div>
                    </div>
                    ${priorityLabelHtml(item.priority)}
                  </button>
                `
                  )
                  .join("")
              : `<p class="section-subheading">All complaints are resolved!</p>`
          }
        </div>

        <div class="card form-stack">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="color:var(--campus-blue-primary);display:flex;">${Icons.database}</span>
            <h2 class="card-title">Local Storage &amp; Dataset Controls</h2>
          </div>
          <p class="section-subheading">
            Student and Admin read/write from the same local storage for the active mode (Demo Sandbox vs Live Campus Storage).
          </p>

          <div class="segmented-control">
            <button type="button" class="segmented-btn ${state.dataMode === DataMode.DEMO ? "active" : ""}" data-action="switch-mode" data-mode="DEMO">Demo Sandbox</button>
            <button type="button" class="segmented-btn ${state.dataMode === DataMode.REAL ? "active" : ""}" data-action="switch-mode" data-mode="REAL">Live Campus Data</button>
          </div>

          <div class="form-row-2">
            <button id="btn-reset-demo" type="button" class="btn btn-outline-neutral">Reset Demo Data</button>
            <button id="btn-clear-real" type="button" class="btn btn-outline-neutral">Clear Live Data</button>
          </div>

          <button id="btn-insights-logout" type="button" class="btn btn-primary btn-full">Switch Role / Sign Out</button>
        </div>
      </section>
    `;

    document.getElementById("btn-reset-demo").addEventListener("click", () => {
      const seeded = Storage.resetDemoData();
      if (state.dataMode === DataMode.DEMO) {
        state.complaints = seeded;
        state.insights = Storage.computeSmartInsights(seeded);
        renderSmartInsights();
      }
      showSnackbar("Demo complaints reset to default sample dataset.");
    });

    document.getElementById("btn-clear-real").addEventListener("click", () => {
      const cleared = Storage.clearRealData();
      if (state.dataMode === DataMode.REAL) {
        state.complaints = cleared;
        state.insights = Storage.computeSmartInsights(cleared);
        renderSmartInsights();
      }
      showSnackbar("Live campus complaints cleared.");
    });

    document.getElementById("btn-insights-logout").addEventListener("click", performLogout);

    wireCommonEvents();
  }

  function openComplaintModal(complaintId) {
    const complaint = state.complaints.find((c) => c.id === complaintId);
    if (!complaint) return;

    state.selectedComplaintId = complaintId;
    const isAdmin = state.session && state.session.role === UserRole.ADMIN;
    if (isAdmin) {
      state.adminEditDraft = {
        status: complaint.status,
        adminResponse: complaint.adminResponse || ""
      };
    } else {
      state.adminEditDraft = null;
    }

    renderModalContent(complaint, isAdmin);
    modalOverlay.classList.remove("hidden");
  }

  function closeModal() {
    state.selectedComplaintId = null;
    state.adminEditDraft = null;
    modalOverlay.classList.add("hidden");
  }

  function renderModalContent(c, isAdmin) {
    const catLabel = (ComplaintCategory[c.category] || ComplaintCategory.OTHER).label;

    modalBody.innerHTML = `
      <div class="row-between">
        <span class="section-subheading" style="margin-top:0;">${escapeHtml(c.id)} · ${escapeHtml(c.createdAt)}</span>
        ${statusBadgeHtml(c.status)}
      </div>

      <h2 style="font-size:19px;font-weight:700;line-height:1.3;">${escapeHtml(c.title)}</h2>

      <div style="font-size:13.5px;font-weight:600;color:var(--campus-blue-primary);">
        ${escapeHtml(c.building)} · ${escapeHtml(c.classroom)} · ${escapeHtml(catLabel)}
      </div>

      <div>${priorityLabelHtml(c.priority)}</div>

      ${
        isAdmin
          ? `<div class="section-subheading" style="margin-top:0;">Submitted by ${escapeHtml(c.submittedBy)} (${escapeHtml(c.reporterId)})</div>`
          : ""
      }

      <p style="font-size:14.5px;color:var(--text-secondary);line-height:1.5;">${escapeHtml(c.description)}</p>

      ${c.photoUri ? `<img src="${c.photoUri}" alt="Attached complaint photo" class="photo-preview" />` : ""}

      ${
        !isAdmin && c.adminResponse
          ? `
        <div class="admin-response-box">
          <div style="font-size:12.5px;font-weight:700;margin-bottom:4px;">Administration Response</div>
          <div style="font-size:13.5px;color:var(--text-secondary);line-height:1.45;">${escapeHtml(c.adminResponse)}</div>
        </div>
      `
          : ""
      }

      ${
        isAdmin && state.adminEditDraft
          ? `
        <div class="card" style="background:var(--surface-canvas);padding:14px;">
          <div class="form-stack">
            <div class="field-label">Update Status</div>
            <div class="segmented-control">
              ${Object.values(ComplaintStatus)
                .map(
                  (st) => `
                <button
                  type="button"
                  class="segmented-btn ${state.adminEditDraft.status === st.key ? "active" : ""}"
                  data-modal-status="${st.key}"
                >${escapeHtml(st.label)}</button>
              `
                )
                .join("")}
            </div>

            <div class="field-group">
              <label class="field-label" for="modal-admin-response">Admin Remarks / Resolution Note</label>
              <textarea
                id="modal-admin-response"
                class="textarea-control"
                placeholder="e.g., Electrician dispatched; scheduled repair today 4 PM."
              >${escapeHtml(state.adminEditDraft.adminResponse)}</textarea>
            </div>

            <button id="btn-modal-save-admin" type="button" class="btn btn-primary btn-full">Save Status &amp; Update Timeline</button>
          </div>
        </div>
      `
          : ""
      }

      <div style="margin-top:4px;">
        <div class="card-title" style="margin-bottom:10px;">Status Timeline</div>
        ${timelineHtml(c.timeline)}
      </div>
    `;

    if (isAdmin && state.adminEditDraft) {
      modalBody.querySelectorAll("[data-modal-status]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.adminEditDraft.status = btn.getAttribute("data-modal-status");
          renderModalContent(c, true);
        });
      });

      const respEl = document.getElementById("modal-admin-response");
      respEl.addEventListener("input", (e) => {
        state.adminEditDraft.adminResponse = e.target.value;
      });

      document.getElementById("btn-modal-save-admin").addEventListener("click", () => {
        updateComplaintByAdmin(c.id, state.adminEditDraft.status, state.adminEditDraft.adminResponse);
        closeModal();
        render();
      });
    }
  }

  function updateComplaintByAdmin(complaintId, newStatus, adminResponse) {
    const now = Storage.currentFormattedDate();
    const cleaned = String(adminResponse || "").trim();

    const updated = state.complaints.map((item) => {
      if (item.id !== complaintId) return item;
      const statusChanged = item.status !== newStatus;
      const remarksChanged = cleaned.length > 0 && cleaned !== item.adminResponse;

      let eventTitle = "Ticket Reviewed";
      if (statusChanged && newStatus === "PENDING") eventTitle = "Marked Pending";
      else if (statusChanged && newStatus === "IN_PROGRESS") eventTitle = "Maintenance In Progress";
      else if (statusChanged && newStatus === "RESOLVED") eventTitle = "Issue Resolved";
      else if (remarksChanged) eventTitle = "Admin Remarks Added";

      const stLabel = (ComplaintStatus[newStatus] || ComplaintStatus.PENDING).label;
      const actor = state.session ? state.session.displayName : "Admin";
      const eventNote = cleaned || `Status updated to ${stLabel} by ${actor}.`;
      const shouldAppend = statusChanged || remarksChanged;

      return {
        ...item,
        status: newStatus,
        adminResponse: cleaned || item.adminResponse,
        updatedAt: now,
        timeline: shouldAppend
          ? [
              ...(item.timeline || []),
              {
                title: eventTitle,
                note: eventNote,
                timestamp: now,
                status: newStatus
              }
            ]
          : item.timeline
      };
    });

    Storage.saveComplaints(state.dataMode, updated);
    state.complaints = updated;
    state.insights = Storage.computeSmartInsights(updated);
    const label = (ComplaintStatus[newStatus] || ComplaintStatus.PENDING).label;
    showSnackbar(`Updated ${complaintId} (${label}).`);
  }

  function wireComplaintCardClicks(container) {
    container.querySelectorAll("[data-open-complaint]").forEach((el) => {
      el.addEventListener("click", () => {
        openComplaintModal(el.getAttribute("data-open-complaint"));
      });
    });
  }

  function wireCommonEvents() {
    wireComplaintCardClicks(mainContent);

    mainContent.querySelectorAll("[data-go-route]").forEach((el) => {
      el.addEventListener("click", () => navigate(el.getAttribute("data-go-route")));
    });

    mainContent.querySelectorAll('[data-action="switch-mode"]').forEach((el) => {
      el.addEventListener("click", () => {
        const mode = el.getAttribute("data-mode");
        loadForMode(mode, state.session);
        showSnackbar(
          mode === DataMode.DEMO ? "Switched to Demo Sandbox storage." : "Switched to Live Campus Storage."
        );
        render();
      });
    });
  }

  function performLogout() {
    Storage.saveSession(null);
    state.session = null;
    state.authError = null;
    state.authDraft.passcode = "";
    state.authDraft.studentPassword = "";
    state.authDraft.showPassword = false;
    state.selectedComplaintId = null;
    state.searchQuery = "";
    state.statusFilter = null;
    state.categoryFilter = null;
    state.priorityFilter = null;
    closeModal();
    navigate(Routes.ROLE_SELECTION);
  }

  btnSwitchRole.addEventListener("click", () => {
    if (!state.session) return;
    const nextRole = state.session.role === UserRole.ADMIN ? UserRole.STUDENT : UserRole.ADMIN;
    const isDemo = state.dataMode === DataMode.DEMO;
    const updatedSession =
      nextRole === UserRole.ADMIN
        ? {
            role: UserRole.ADMIN,
            displayName: isDemo ? "Facilities Lead (Demo)" : "Campus Facilities Admin",
            identifier: isDemo ? "ADM-DEMO-01" : "ADM-FAC-01",
            isDemoSession: isDemo
          }
        : {
            role: UserRole.STUDENT,
            displayName: isDemo ? "Mohit Sharma (Demo)" : "Campus Student",
            identifier: isDemo ? "25BCAN0190" : "STU-2026-0412",
            isDemoSession: isDemo
          };

    loadForMode(state.dataMode, updatedSession);
    navigate(nextRole === UserRole.ADMIN ? Routes.ADMIN_DASHBOARD : Routes.STUDENT_DASHBOARD);
  });

  btnSignOut.addEventListener("click", performLogout);
  btnToggleAside.addEventListener("click", () => {
    state.asideOpen = !state.asideOpen;
    renderDataAside();
  });
  modalCloseBtn.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  async function refreshDataAside() {
    state.inspectorSnap = await Storage.fetchInspectorSnapshot();
    renderDataAside();
  }

  function renderDataAside() {
    if (asideToggleDot) {
      asideToggleDot.classList.toggle("online", Boolean(Storage.backendState.connected));
    }

    const shouldShow = state.route !== Routes.SPLASH && state.asideOpen;
    if (!shouldShow) {
      dataAside.classList.add("hidden");
      return;
    }
    dataAside.classList.remove("hidden");

    const snap = state.inspectorSnap;
    const isOnline = snap ? snap.connected : Storage.backendState.connected;
    const files = (snap && snap.files) || [];
    const accounts = (snap && snap.studentAccounts) || [];
    const logs = (snap && snap.activityLog) || [];
    const activeComplaints = state.complaints || [];

    dataAside.innerHTML = `
      <div class="aside-header">
        <div>
          <div style="font-size:15px;font-weight:700;">Backend &amp; Data Flow</div>
          <div style="font-size:11.5px;color:var(--text-secondary);">Where all CampusCare data is saved</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="aside-pill ${isOnline ? "online" : "offline"}">
            ${isOnline ? "● Java Backend" : "● Browser Storage"}
          </span>
          <button id="aside-close-btn" type="button" class="modal-close-btn" style="position:static;width:28px;height:28px;font-size:18px;" aria-label="Close aside">&times;</button>
        </div>
      </div>

      <div class="aside-body">
        <div class="aside-section">
          <div class="aside-section-title">
            <span>Storage Destination</span>
            <span style="color:var(--campus-blue-primary);font-weight:600;">${state.dataMode === DataMode.DEMO ? "Demo Mode" : "Live Mode"}</span>
          </div>
          <div class="aside-path-code">${escapeHtml((snap && snap.dataDir) || Storage.backendState.dataDir)}</div>
          ${
            !isOnline
              ? `<div style="font-size:11.5px;color:var(--text-secondary);line-height:1.4;">Run <strong>start-server.bat</strong> to save all complaints &amp; student accounts directly to JSON files on disk.</div>`
              : ""
          }
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${files
              .map(
                (f) => `
              <div class="aside-file-row">
                <div>
                  <div style="font-weight:600;color:var(--text-primary);">${escapeHtml(f.label)}</div>
                  <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(f.name)}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-weight:700;color:var(--campus-blue-primary);">${f.records} record(s)</div>
                  <div style="font-size:11px;color:var(--text-muted);">${f.bytes} B</div>
                </div>
              </div>
            `
              )
              .join("")}
          </div>
        </div>

        <div class="aside-section">
          <div class="aside-section-title">
            <span>Saved Student Accounts</span>
            <span>${accounts.length}</span>
          </div>
          ${
            accounts.length
              ? `
            <div class="aside-table-wrap">
              <table class="aside-table">
                <thead>
                  <tr><th>Student ID</th><th>Name</th><th>Last Login</th></tr>
                </thead>
                <tbody>
                  ${accounts
                    .map(
                      (a) => `
                    <tr>
                      <td style="font-weight:600;">${escapeHtml(a.studentId)}</td>
                      <td>${escapeHtml(a.displayName)}</td>
                      <td>${escapeHtml(a.lastLogin || "Saved")}</td>
                    </tr>
                  `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          `
              : `<div style="font-size:12px;color:var(--text-muted);">No live student accounts registered yet. Sign in on Student Portal to save one.</div>`
          }
        </div>

        <div class="aside-section">
          <div class="aside-section-title">
            <span>Saved Tickets (${state.dataMode === DataMode.DEMO ? "Demo" : "Live"})</span>
            <span>${activeComplaints.length}</span>
          </div>
          ${
            activeComplaints.length
              ? `
            <div class="aside-table-wrap">
              <table class="aside-table">
                <thead>
                  <tr><th>ID</th><th>Issue</th><th>Location</th><th>Status</th></tr>
                </thead>
                <tbody>
                  ${activeComplaints
                    .map((c) => {
                      const st = (ComplaintStatus[c.status] || ComplaintStatus.PENDING).label;
                      return `
                      <tr>
                        <td style="font-weight:600;color:var(--campus-blue-primary);">${escapeHtml(c.id)}</td>
                        <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(c.title)}</td>
                        <td>${escapeHtml(c.building)}</td>
                        <td>${escapeHtml(st)}</td>
                      </tr>
                    `;
                    })
                    .join("")}
                </tbody>
              </table>
            </div>
          `
              : `<div style="font-size:12px;color:var(--text-muted);">No tickets in this dataset yet.</div>`
          }
        </div>

        <div class="aside-section">
          <div class="aside-section-title">
            <span>Live Save &amp; Activity Log</span>
            <span>${logs.length}</span>
          </div>
          ${
            logs.length
              ? `
            <div class="aside-log-list">
              ${logs
                .slice(0, 10)
                .map(
                  (l) => `
                <div class="aside-log-item">
                  <span class="aside-log-meta">[${escapeHtml(l.time)}] ${escapeHtml(l.action)}</span>
                  <span>${escapeHtml(l.detail)}</span>
                </div>
              `
                )
                .join("")}
            </div>
          `
              : `<div style="font-size:12px;color:var(--text-muted);">Activity will appear here as data is saved.</div>`
          }
        </div>

        <div class="form-row-2">
          <button id="aside-refresh-btn" type="button" class="btn btn-outline-neutral" style="height:38px;font-size:12.5px;">Refresh</button>
          <button id="aside-export-btn" type="button" class="btn btn-primary" style="height:38px;font-size:12.5px;">Export JSON</button>
        </div>
      </div>
    `;

    document.getElementById("aside-close-btn").addEventListener("click", () => {
      state.asideOpen = false;
      renderDataAside();
      if (state.route === Routes.ROLE_SELECTION) renderRoleSelection();
    });
    document.getElementById("aside-refresh-btn").addEventListener("click", () => {
      refreshDataAside();
      showSnackbar("Data inspector refreshed.");
    });
    document.getElementById("aside-export-btn").addEventListener("click", () => {
      Storage.exportAllDataJson();
      showSnackbar("Exported CampusCare JSON backup.");
    });
  }

  function render() {
    renderChrome();
    switch (state.route) {
      case Routes.SPLASH:
        renderSplash();
        break;
      case Routes.ROLE_SELECTION:
        renderRoleSelection();
        break;
      case Routes.STUDENT_DASHBOARD:
        renderStudentDashboard();
        break;
      case Routes.REPORT_ISSUE:
        renderReportIssue();
        break;
      case Routes.TRACK_COMPLAINTS:
        renderTrackComplaints();
        break;
      case Routes.ADMIN_DASHBOARD:
        renderAdminDashboard();
        break;
      case Routes.SMART_INSIGHTS:
        renderSmartInsights();
        break;
      default:
        renderSplash();
    }
    renderDataAside();
  }

  Storage.backendState.onChange = () => {
    refreshDataAside();
  };

  // Boot
  Storage.checkBackend().then(() => refreshDataAside());
  if (state.session) {
    loadForMode(state.session.isDemoSession ? DataMode.DEMO : DataMode.REAL, state.session);
  } else {
    loadForMode(DataMode.DEMO, null);
  }
  render();
})(window);
