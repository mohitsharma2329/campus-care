import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;

public class CampusCareServer {

    private static final int PORT = 8080;
    private static final Path ROOT_DIR = resolveRootDir();
    private static final Path DATA_DIR = ROOT_DIR.resolve("server").resolve("data");
    private static final Path DEMO_FILE = DATA_DIR.resolve("demo_complaints.json");
    private static final Path REAL_FILE = DATA_DIR.resolve("real_complaints.json");
    private static final Path ACCOUNTS_FILE = DATA_DIR.resolve("student_accounts.json");
    private static final Path ACTIVITY_FILE = DATA_DIR.resolve("activity_log.json");

    private static final Object LOCK = new Object();
    private static final Deque<Map<String, Object>> ACTIVITY_LOG = new ArrayDeque<>();
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("HH:mm:ss");

    private static Path resolveRootDir() {
        Path cwd = Paths.get("").toAbsolutePath().normalize();
        if (Files.exists(cwd.resolve("index.html"))) {
            return cwd;
        }
        if (cwd.getFileName() != null && "server".equalsIgnoreCase(cwd.getFileName().toString())) {
            Path parent = cwd.getParent();
            if (parent != null && Files.exists(parent.resolve("index.html"))) {
                return parent;
            }
        }
        return cwd;
    }

    public static void main(String[] args) throws IOException {
        int port = PORT;
        if (args.length > 0) {
            try {
                port = Integer.parseInt(args[0]);
            } catch (NumberFormatException ignored) {}
        }

        ensureDataFiles();

        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.createContext("/api/health", CampusCareServer::handleHealth);
        server.createContext("/api/complaints/reset-demo", CampusCareServer::handleResetDemo);
        server.createContext("/api/complaints/real", CampusCareServer::handleClearReal);
        server.createContext("/api/complaints", CampusCareServer::handleComplaints);
        server.createContext("/api/auth/student", CampusCareServer::handleStudentAuth);
        server.createContext("/api/inspector", CampusCareServer::handleInspector);
        server.createContext("/", CampusCareServer::handleStatic);
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.start();

        logActivity("SERVER", "Backend started on http://127.0.0.1:" + port + " (saving to server/data/*.json)");
        System.out.println("CampusCare Backend running at http://localhost:" + port);
        System.out.println("Data directory: " + DATA_DIR.toAbsolutePath());
    }

    private static void ensureDataFiles() throws IOException {
        Files.createDirectories(DATA_DIR);
        if (!Files.exists(DEMO_FILE)) {
            Files.writeString(DEMO_FILE, DEFAULT_DEMO_JSON, StandardCharsets.UTF_8);
        }
        if (!Files.exists(REAL_FILE)) {
            Files.writeString(REAL_FILE, "[]", StandardCharsets.UTF_8);
        }
        if (!Files.exists(ACCOUNTS_FILE)) {
            Files.writeString(ACCOUNTS_FILE, "{}", StandardCharsets.UTF_8);
        }
        if (!Files.exists(ACTIVITY_FILE)) {
            Files.writeString(ACTIVITY_FILE, "[]", StandardCharsets.UTF_8);
        } else {
            try {
                Object parsed = Json.parse(Files.readString(ACTIVITY_FILE, StandardCharsets.UTF_8));
                if (parsed instanceof List<?>) {
                    for (Object item : (List<?>) parsed) {
                        if (item instanceof Map<?, ?>) {
                            @SuppressWarnings("unchecked")
                            Map<String, Object> entry = (Map<String, Object>) item;
                            ACTIVITY_LOG.addLast(entry);
                        }
                    }
                }
            } catch (Exception ignored) {}
        }
    }

    private static void logActivity(String action, String detail) {
        synchronized (LOCK) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("time", LocalTime.now().format(TIME_FMT));
            entry.put("action", action);
            entry.put("detail", detail);
            ACTIVITY_LOG.addFirst(entry);
            while (ACTIVITY_LOG.size() > 30) {
                ACTIVITY_LOG.removeLast();
            }
            try {
                Files.writeString(ACTIVITY_FILE, Json.stringify(new ArrayList<>(ACTIVITY_LOG)), StandardCharsets.UTF_8);
            } catch (IOException ignored) {}
        }
    }

    private static void addCorsHeaders(Headers headers) {
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        headers.set("Access-Control-Allow-Headers", "Content-Type");
        headers.set("Cache-Control", "no-store");
    }

    private static boolean handlePreflight(HttpExchange ex) throws IOException {
        addCorsHeaders(ex.getResponseHeaders());
        if ("OPTIONS".equalsIgnoreCase(ex.getRequestMethod())) {
            ex.sendResponseHeaders(204, -1);
            ex.close();
            return true;
        }
        return false;
    }

    private static void handleHealth(HttpExchange ex) throws IOException {
        if (handlePreflight(ex)) return;
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("ok", true);
        payload.put("service", "CampusCare Java Backend");
        payload.put("dataDir", DATA_DIR.toAbsolutePath().toString());
        payload.put("files", Map.of(
                "demoComplaints", DEMO_FILE.toAbsolutePath().toString(),
                "realComplaints", REAL_FILE.toAbsolutePath().toString(),
                "studentAccounts", ACCOUNTS_FILE.toAbsolutePath().toString()
        ));
        sendJson(ex, 200, Json.stringify(payload));
    }

    private static void handleComplaints(HttpExchange ex) throws IOException {
        if (handlePreflight(ex)) return;
        String mode = queryParam(ex.getRequestURI().getRawQuery(), "mode");
        boolean isDemo = !"REAL".equalsIgnoreCase(mode);
        Path targetFile = isDemo ? DEMO_FILE : REAL_FILE;

        if ("GET".equalsIgnoreCase(ex.getRequestMethod())) {
            String raw;
            synchronized (LOCK) {
                raw = Files.readString(targetFile, StandardCharsets.UTF_8).trim();
                if (raw.isEmpty()) raw = "[]";
            }
            sendJson(ex, 200, raw);
            return;
        }

        if ("PUT".equalsIgnoreCase(ex.getRequestMethod())) {
            String body = readBody(ex).trim();
            if (!body.startsWith("[") || !body.endsWith("]")) {
                sendJson(ex, 400, Json.stringify(Map.of("ok", false, "error", "Expected JSON array of complaints.")));
                return;
            }
            Object parsed;
            try {
                parsed = Json.parse(body);
            } catch (Exception e) {
                sendJson(ex, 400, Json.stringify(Map.of("ok", false, "error", "Invalid JSON payload.")));
                return;
            }
            if (!(parsed instanceof List<?>)) {
                sendJson(ex, 400, Json.stringify(Map.of("ok", false, "error", "Expected JSON array.")));
                return;
            }
            int count = ((List<?>) parsed).size();
            synchronized (LOCK) {
                Files.writeString(targetFile, body, StandardCharsets.UTF_8);
            }
            String fileName = targetFile.getFileName().toString();
            logActivity("SAVE", "Saved " + count + " complaint(s) to " + fileName);
            sendJson(ex, 200, Json.stringify(Map.of("ok", true, "count", count, "file", fileName)));
            return;
        }

        sendJson(ex, 405, Json.stringify(Map.of("ok", false, "error", "Method not allowed")));
    }

    private static void handleResetDemo(HttpExchange ex) throws IOException {
        if (handlePreflight(ex)) return;
        if (!"POST".equalsIgnoreCase(ex.getRequestMethod())) {
            sendJson(ex, 405, Json.stringify(Map.of("ok", false, "error", "Method not allowed")));
            return;
        }
        synchronized (LOCK) {
            Files.writeString(DEMO_FILE, DEFAULT_DEMO_JSON, StandardCharsets.UTF_8);
        }
        logActivity("RESET", "Reset demo_complaints.json to 6 default sample records");
        sendJson(ex, 200, DEFAULT_DEMO_JSON);
    }

    private static void handleClearReal(HttpExchange ex) throws IOException {
        if (handlePreflight(ex)) return;
        if (!"DELETE".equalsIgnoreCase(ex.getRequestMethod())) {
            sendJson(ex, 405, Json.stringify(Map.of("ok", false, "error", "Method not allowed")));
            return;
        }
        synchronized (LOCK) {
            Files.writeString(REAL_FILE, "[]", StandardCharsets.UTF_8);
        }
        logActivity("CLEAR", "Cleared all records in real_complaints.json");
        sendJson(ex, 200, "[]");
    }

    @SuppressWarnings("unchecked")
    private static void handleStudentAuth(HttpExchange ex) throws IOException {
        if (handlePreflight(ex)) return;
        if (!"POST".equalsIgnoreCase(ex.getRequestMethod())) {
            sendJson(ex, 405, Json.stringify(Map.of("ok", false, "error", "Method not allowed")));
            return;
        }

        Object parsed;
        try {
            parsed = Json.parse(readBody(ex));
        } catch (Exception e) {
            sendJson(ex, 400, Json.stringify(Map.of("ok", false, "error", "Invalid JSON.")));
            return;
        }
        if (!(parsed instanceof Map<?, ?>)) {
            sendJson(ex, 400, Json.stringify(Map.of("ok", false, "error", "Expected JSON object.")));
            return;
        }

        Map<String, Object> req = (Map<String, Object>) parsed;
        String studentId = strVal(req.get("studentId")).trim();
        String displayName = strVal(req.get("displayName")).trim();
        String password = strVal(req.get("password"));

        if (displayName.length() < 2 || studentId.length() < 3) {
            sendJson(ex, 400, Json.stringify(Map.of("ok", false, "error", "Please enter your name and valid campus ID.")));
            return;
        }
        if (password.length() < 4) {
            sendJson(ex, 400, Json.stringify(Map.of("ok", false, "error", "Password must be at least 4 characters.")));
            return;
        }

        String key = studentId.toUpperCase();
        boolean isNew = false;

        synchronized (LOCK) {
            Map<String, Object> accounts = readAccountsMap();
            Object existingObj = accounts.get(key);
            if (existingObj instanceof Map<?, ?>) {
                Map<String, Object> existing = (Map<String, Object>) existingObj;
                String savedPw = strVal(existing.get("password"));
                if (!savedPw.equals(password)) {
                    logActivity("AUTH_FAIL", "Rejected sign-in for Student ID " + key + " (wrong password)");
                    sendJson(ex, 401, Json.stringify(Map.of("ok", false, "error", "Incorrect password for this Student ID.")));
                    return;
                }
                existing.put("displayName", displayName);
                existing.put("lastLogin", LocalTime.now().format(TIME_FMT));
                accounts.put(key, existing);
            } else {
                isNew = true;
                Map<String, Object> record = new LinkedHashMap<>();
                record.put("studentId", key);
                record.put("displayName", displayName);
                record.put("password", password);
                record.put("lastLogin", LocalTime.now().format(TIME_FMT));
                accounts.put(key, record);
            }
            Files.writeString(ACCOUNTS_FILE, Json.stringify(accounts), StandardCharsets.UTF_8);
        }

        logActivity(isNew ? "REGISTER" : "SIGN_IN",
                (isNew ? "Saved new student account " : "Verified student ") + key + " -> student_accounts.json");
        sendJson(ex, 200, Json.stringify(Map.of("ok", true, "isNew", isNew, "studentId", key)));
    }

    @SuppressWarnings("unchecked")
    private static void handleInspector(HttpExchange ex) throws IOException {
        if (handlePreflight(ex)) return;
        if (!"GET".equalsIgnoreCase(ex.getRequestMethod())) {
            sendJson(ex, 405, Json.stringify(Map.of("ok", false, "error", "Method not allowed")));
            return;
        }

        List<Object> demoList;
        List<Object> realList;
        List<Map<String, Object>> safeAccounts = new ArrayList<>();
        List<Map<String, Object>> logs;

        synchronized (LOCK) {
            demoList = safeParseList(DEMO_FILE);
            realList = safeParseList(REAL_FILE);
            Map<String, Object> accounts = readAccountsMap();
            for (Map.Entry<String, Object> entry : accounts.entrySet()) {
                if (entry.getValue() instanceof Map<?, ?>) {
                    Map<String, Object> acc = (Map<String, Object>) entry.getValue();
                    Map<String, Object> safe = new LinkedHashMap<>();
                    safe.put("studentId", entry.getKey());
                    safe.put("displayName", strVal(acc.get("displayName")));
                    safe.put("lastLogin", strVal(acc.get("lastLogin")));
                    safe.put("passwordSet", true);
                    safeAccounts.add(safe);
                }
            }
            logs = new ArrayList<>(ACTIVITY_LOG);
        }

        List<Map<String, Object>> files = List.of(
                fileInfo("Live Complaints", REAL_FILE, realList.size()),
                fileInfo("Demo Complaints", DEMO_FILE, demoList.size()),
                fileInfo("Student Accounts", ACCOUNTS_FILE, safeAccounts.size())
        );

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("dataDir", DATA_DIR.toAbsolutePath().toString());
        result.put("files", files);
        result.put("studentAccounts", safeAccounts);
        result.put("demoCount", demoList.size());
        result.put("realCount", realList.size());
        result.put("activityLog", logs);

        sendJson(ex, 200, Json.stringify(result));
    }

    private static Map<String, Object> fileInfo(String label, Path p, int records) throws IOException {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("label", label);
        m.put("name", p.getFileName().toString());
        m.put("path", p.toAbsolutePath().toString());
        m.put("records", records);
        m.put("bytes", Files.exists(p) ? Files.size(p) : 0L);
        return m;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> readAccountsMap() {
        try {
            String raw = Files.readString(ACCOUNTS_FILE, StandardCharsets.UTF_8).trim();
            if (raw.isEmpty()) return new LinkedHashMap<>();
            Object parsed = Json.parse(raw);
            if (parsed instanceof Map<?, ?>) {
                return (Map<String, Object>) parsed;
            }
        } catch (Exception ignored) {}
        return new LinkedHashMap<>();
    }

    @SuppressWarnings("unchecked")
    private static List<Object> safeParseList(Path p) {
        try {
            String raw = Files.readString(p, StandardCharsets.UTF_8).trim();
            if (raw.isEmpty()) return List.of();
            Object parsed = Json.parse(raw);
            if (parsed instanceof List<?>) return (List<Object>) parsed;
        } catch (Exception ignored) {}
        return List.of();
    }

    private static void handleStatic(HttpExchange ex) throws IOException {
        if (handlePreflight(ex)) return;
        String reqPath = ex.getRequestURI().getPath();
        if (reqPath == null || "/".equals(reqPath)) {
            reqPath = "/index.html";
        }
        String rel = reqPath.startsWith("/") ? reqPath.substring(1) : reqPath;
        Path resolved = ROOT_DIR.resolve(rel).normalize();
        if (!resolved.startsWith(ROOT_DIR) || !Files.exists(resolved) || Files.isDirectory(resolved)) {
            byte[] notFound = "Not Found".getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(404, notFound.length);
            try (OutputStream os = ex.getResponseBody()) {
                os.write(notFound);
            }
            return;
        }

        String contentType = guessContentType(resolved.getFileName().toString());
        byte[] bytes = Files.readAllBytes(resolved);
        ex.getResponseHeaders().set("Content-Type", contentType);
        ex.sendResponseHeaders(200, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }

    private static String guessContentType(String name) {
        String lower = name.toLowerCase();
        if (lower.endsWith(".html")) return "text/html; charset=utf-8";
        if (lower.endsWith(".css")) return "text/css; charset=utf-8";
        if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
        if (lower.endsWith(".json")) return "application/json; charset=utf-8";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        return "application/octet-stream";
    }

    private static void sendJson(HttpExchange ex, int status, String json) throws IOException {
        addCorsHeaders(ex.getResponseHeaders());
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }

    private static String readBody(HttpExchange ex) throws IOException {
        try (InputStream is = ex.getRequestBody(); ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) != -1) {
                bos.write(buf, 0, n);
            }
            return bos.toString(StandardCharsets.UTF_8);
        }
    }

    private static String queryParam(String rawQuery, String key) {
        if (rawQuery == null || rawQuery.isEmpty()) return null;
        for (String pair : rawQuery.split("&")) {
            int eq = pair.indexOf('=');
            if (eq > 0) {
                String k = URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8);
                if (key.equals(k)) {
                    return URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8);
                }
            }
        }
        return null;
    }

    private static String strVal(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    // Minimal, strict JSON parser & serializer with zero external dependencies
    static final class Json {
        private final String s;
        private int i = 0;

        private Json(String s) {
            this.s = s;
        }

        static Object parse(String input) {
            Json p = new Json(input);
            Object val = p.readValue();
            p.skipWs();
            if (p.i != p.s.length()) {
                throw new IllegalArgumentException("Trailing characters at " + p.i);
            }
            return val;
        }

        static String stringify(Object value) {
            StringBuilder sb = new StringBuilder();
            writeVal(sb, value);
            return sb.toString();
        }

        private static void writeVal(StringBuilder sb, Object v) {
            if (v == null) {
                sb.append("null");
            } else if (v instanceof Boolean || v instanceof Number) {
                sb.append(v);
            } else if (v instanceof String) {
                writeString(sb, (String) v);
            } else if (v instanceof Map<?, ?>) {
                sb.append('{');
                boolean first = true;
                for (Map.Entry<?, ?> e : ((Map<?, ?>) v).entrySet()) {
                    if (!first) sb.append(',');
                    first = false;
                    writeString(sb, String.valueOf(e.getKey()));
                    sb.append(':');
                    writeVal(sb, e.getValue());
                }
                sb.append('}');
            } else if (v instanceof Iterable<?>) {
                sb.append('[');
                boolean first = true;
                for (Object item : (Iterable<?>) v) {
                    if (!first) sb.append(',');
                    first = false;
                    writeVal(sb, item);
                }
                sb.append(']');
            } else {
                writeString(sb, String.valueOf(v));
            }
        }

        private static void writeString(StringBuilder sb, String str) {
            sb.append('"');
            for (int k = 0; k < str.length(); k++) {
                char c = str.charAt(k);
                switch (c) {
                    case '"' -> sb.append("\\\"");
                    case '\\' -> sb.append("\\\\");
                    case '\b' -> sb.append("\\b");
                    case '\f' -> sb.append("\\f");
                    case '\n' -> sb.append("\\n");
                    case '\r' -> sb.append("\\r");
                    case '\t' -> sb.append("\\t");
                    default -> {
                        if (c < 0x20) {
                            sb.append(String.format("\\u%04x", (int) c));
                        } else {
                            sb.append(c);
                        }
                    }
                }
            }
            sb.append('"');
        }

        private void skipWs() {
            while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++;
        }

        private Object readValue() {
            skipWs();
            if (i >= s.length()) throw new IllegalArgumentException("Unexpected EOF");
            char c = s.charAt(i);
            return switch (c) {
                case '{' -> readObject();
                case '[' -> readArray();
                case '"' -> readString();
                case 't', 'f' -> readBoolean();
                case 'n' -> readNull();
                default -> readNumber();
            };
        }

        private Map<String, Object> readObject() {
            Map<String, Object> map = new LinkedHashMap<>();
            i++; // '{'
            skipWs();
            if (i < s.length() && s.charAt(i) == '}') {
                i++;
                return map;
            }
            while (true) {
                skipWs();
                String key = readString();
                skipWs();
                if (i >= s.length() || s.charAt(i) != ':') throw new IllegalArgumentException("Expected ':'");
                i++;
                Object val = readValue();
                map.put(key, val);
                skipWs();
                if (i >= s.length()) throw new IllegalArgumentException("Unterminated object");
                char next = s.charAt(i++);
                if (next == '}') break;
                if (next != ',') throw new IllegalArgumentException("Expected ',' or '}'");
            }
            return map;
        }

        private List<Object> readArray() {
            List<Object> list = new ArrayList<>();
            i++; // '['
            skipWs();
            if (i < s.length() && s.charAt(i) == ']') {
                i++;
                return list;
            }
            while (true) {
                list.add(readValue());
                skipWs();
                if (i >= s.length()) throw new IllegalArgumentException("Unterminated array");
                char next = s.charAt(i++);
                if (next == ']') break;
                if (next != ',') throw new IllegalArgumentException("Expected ',' or ']'");
            }
            return list;
        }

        private String readString() {
            if (s.charAt(i) != '"') throw new IllegalArgumentException("Expected '\"'");
            i++;
            StringBuilder sb = new StringBuilder();
            while (i < s.length()) {
                char c = s.charAt(i++);
                if (c == '"') return sb.toString();
                if (c == '\\') {
                    if (i >= s.length()) throw new IllegalArgumentException("Bad escape");
                    char esc = s.charAt(i++);
                    switch (esc) {
                        case '"', '\\', '/' -> sb.append(esc);
                        case 'b' -> sb.append('\b');
                        case 'f' -> sb.append('\f');
                        case 'n' -> sb.append('\n');
                        case 'r' -> sb.append('\r');
                        case 't' -> sb.append('\t');
                        case 'u' -> {
                            String hex = s.substring(i, i + 4);
                            sb.append((char) Integer.parseInt(hex, 16));
                            i += 4;
                        }
                        default -> throw new IllegalArgumentException("Invalid escape \\" + esc);
                    }
                } else {
                    sb.append(c);
                }
            }
            throw new IllegalArgumentException("Unterminated string");
        }

        private Boolean readBoolean() {
            if (s.startsWith("true", i)) {
                i += 4;
                return Boolean.TRUE;
            }
            if (s.startsWith("false", i)) {
                i += 5;
                return Boolean.FALSE;
            }
            throw new IllegalArgumentException("Invalid boolean");
        }

        private Object readNull() {
            if (s.startsWith("null", i)) {
                i += 4;
                return null;
            }
            throw new IllegalArgumentException("Invalid null");
        }

        private Number readNumber() {
            int start = i;
            while (i < s.length()) {
                char c = s.charAt(i);
                if ((c >= '0' && c <= '9') || c == '-' || c == '+' || c == '.' || c == 'e' || c == 'E') {
                    i++;
                } else {
                    break;
                }
            }
            String num = s.substring(start, i);
            if (num.contains(".") || num.contains("e") || num.contains("E")) {
                return Double.parseDouble(num);
            }
            long l = Long.parseLong(num);
            if (l >= Integer.MIN_VALUE && l <= Integer.MAX_VALUE) return (int) l;
            return l;
        }
    }

    private static final String DEFAULT_DEMO_JSON = """
[
  {
    "id": "CC-2026-1041",
    "title": "Ceiling projector flickering & loose power cable",
    "description": "Main ceiling projector in Lecture Hall B-204 cuts out every 5 minutes and shows an amber lamp warning during morning lectures.",
    "category": "ELECTRICITY",
    "building": "Science Block",
    "classroom": "Hall B-204",
    "priority": "HIGH",
    "status": "IN_PROGRESS",
    "submittedBy": "Aarav Mehta",
    "reporterId": "STU-2026-0412",
    "createdAt": "Nov 14, 2026 · 09:15",
    "updatedAt": "Nov 15, 2026 · 14:20",
    "photoUri": null,
    "adminResponse": "AV technician inspected wiring harness. Replacement ballast ordered and scheduled for afternoon installation.",
    "isDemo": true,
    "timeline": [
      {
        "title": "Complaint Submitted",
        "note": "Reported by Aarav Mehta (Science Block · Hall B-204).",
        "timestamp": "Nov 14, 2026 · 09:15",
        "status": "PENDING"
      },
      {
        "title": "Assigned to Electrical & AV Team",
        "note": "AV technician inspected wiring harness and ordered replacement ballast.",
        "timestamp": "Nov 15, 2026 · 14:20",
        "status": "IN_PROGRESS"
      }
    ]
  },
  {
    "id": "CC-2026-1042",
    "title": "Drinking water dispenser leaking onto corridor floor",
    "description": "Continuous water leakage from the chiller drain valve outside Room 203 creates a slip hazard between classes.",
    "category": "WATER",
    "building": "Engineering Wing",
    "classroom": "Corridor 203",
    "priority": "HIGH",
    "status": "PENDING",
    "submittedBy": "Priya Nair",
    "reporterId": "STU-2026-0891",
    "createdAt": "Nov 16, 2026 · 11:40",
    "updatedAt": "Nov 16, 2026 · 11:40",
    "photoUri": null,
    "adminResponse": "",
    "isDemo": true,
    "timeline": [
      {
        "title": "Complaint Submitted",
        "note": "Flagged as High Priority slip hazard near Engineering Wing Corridor 203.",
        "timestamp": "Nov 16, 2026 · 11:40",
        "status": "PENDING"
      }
    ]
  },
  {
    "id": "CC-2026-1043",
    "title": "Dead Wi-Fi access point in Central Library 2F",
    "description": "Students seated near the quiet study bays cannot connect to CampusNet-5G; signal drops completely after authentication.",
    "category": "INTERNET",
    "building": "Central Library",
    "classroom": "2F Quiet Zone",
    "priority": "HIGH",
    "status": "PENDING",
    "submittedBy": "Daniel Kim",
    "reporterId": "STU-2026-0194",
    "createdAt": "Nov 16, 2026 · 16:05",
    "updatedAt": "Nov 16, 2026 · 16:05",
    "photoUri": null,
    "adminResponse": "",
    "isDemo": true,
    "timeline": [
      {
        "title": "Complaint Submitted",
        "note": "Reported network outage in Central Library 2F Quiet Zone.",
        "timestamp": "Nov 16, 2026 · 16:05",
        "status": "PENDING"
      }
    ]
  },
  {
    "id": "CC-2026-1044",
    "title": "Broken desk hinges in rows 3 and 4",
    "description": "Four tablet-arm chairs have loose mounting bolts and wobbling writing surfaces making note-taking difficult.",
    "category": "FURNITURE",
    "building": "Science Block",
    "classroom": "Hall B-204",
    "priority": "MEDIUM",
    "status": "PENDING",
    "submittedBy": "Maya Lin",
    "reporterId": "STU-2026-0520",
    "createdAt": "Nov 15, 2026 · 13:10",
    "updatedAt": "Nov 15, 2026 · 13:10",
    "photoUri": null,
    "adminResponse": "",
    "isDemo": true,
    "timeline": [
      {
        "title": "Complaint Submitted",
        "note": "Reported furniture wear in Science Block · Hall B-204.",
        "timestamp": "Nov 15, 2026 · 13:10",
        "status": "PENDING"
      }
    ]
  },
  {
    "id": "CC-2026-1045",
    "title": "Restroom exhaust fan & sanitation refill needed",
    "description": "Second floor men's restroom ventilation fan is off and soap dispensers are empty.",
    "category": "CLEANLINESS",
    "building": "Engineering Wing",
    "classroom": "Corridor 203",
    "priority": "MEDIUM",
    "status": "RESOLVED",
    "submittedBy": "Lucas Rossi",
    "reporterId": "STU-2026-0733",
    "createdAt": "Nov 12, 2026 · 08:50",
    "updatedAt": "Nov 13, 2026 · 10:15",
    "photoUri": null,
    "adminResponse": "Custodial team sanitized restroom, refilled dispensers, and reset the ventilation relay.",
    "isDemo": true,
    "timeline": [
      {
        "title": "Complaint Submitted",
        "note": "Sanitation and airflow ticket logged.",
        "timestamp": "Nov 12, 2026 · 08:50",
        "status": "PENDING"
      },
      {
        "title": "Housekeeping Dispatched",
        "note": "Custodial supervisor assigned morning crew.",
        "timestamp": "Nov 12, 2026 · 12:30",
        "status": "IN_PROGRESS"
      },
      {
        "title": "Issue Resolved",
        "note": "Sanitized, restocked, and exhaust fan verified operational.",
        "timestamp": "Nov 13, 2026 · 10:15",
        "status": "RESOLVED"
      }
    ]
  },
  {
    "id": "CC-2026-1046",
    "title": "Power outlet strip sparking near lab bench 6",
    "description": "Wall surge protector strip flickers when oscilloscopes are plugged in. Needs electrician check.",
    "category": "ELECTRICITY",
    "building": "Science Block",
    "classroom": "Hall B-204",
    "priority": "LOW",
    "status": "RESOLVED",
    "submittedBy": "Sofia Patel",
    "reporterId": "STU-2026-0611",
    "createdAt": "Nov 10, 2026 · 15:25",
    "updatedAt": "Nov 11, 2026 · 17:00",
    "photoUri": null,
    "adminResponse": "Replaced outlet strip with industrial-grade surge module and tested circuit breaker.",
    "isDemo": true,
    "timeline": [
      {
        "title": "Complaint Submitted",
        "note": "Logged outlet inspection request.",
        "timestamp": "Nov 10, 2026 · 15:25",
        "status": "PENDING"
      },
      {
        "title": "Issue Resolved",
        "note": "Replaced outlet strip and verified load safety.",
        "timestamp": "Nov 11, 2026 · 17:00",
        "status": "RESOLVED"
      }
    ]
  }
]
""";
}
