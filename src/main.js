import { createClient } from "@supabase/supabase-js";
import "./style.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const configured = supabaseUrl && supabaseKey && !supabaseUrl.includes("YOUR_PROJECT");
const supabase = configured ? createClient(supabaseUrl, supabaseKey) : null;

const app = document.querySelector("#app");
let session = null;
let profile = null;
let records = [];

const labels = {
  patient_name: "პაციენტი", history_number: "ისტორიის №", admission_date: "შემოსვლის თარიღი",
  department: "განყოფილება", doctor_name: "ექიმი", contact_name: "საკონტაქტო პირი",
  contact_details: "ტელეფონი / იდენტიფიკატორი", relationship: "კავშირი პაციენტთან",
  authority_basis: "უფლებამოსილების საფუძველი", communication_at: "კომუნიკაციის თარიღი და დრო",
  channel: "არხი", reason: "მიზეზი", information_summary: "მიწოდებული ინფორმაცია",
  understanding: "გაგების შეფასება", questions_answers: "კითხვები და პასუხები",
  agreed_actions: "შეთანხმებული მოქმედება", next_update: "შემდეგი განახლება",
  staff_name: "ჩანაწერის შემქმნელი"
};

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
}
function dateKa(value, time = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ka-GE", time
    ? { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
    : { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
function monthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function notify(text, type = "success") {
  const el = document.querySelector("#message");
  if (el) { el.className = type; el.textContent = text; }
}

function renderLogin() {
  app.innerHTML = `
    <main class="auth-card card">
      <h1>კომუნიკაციის რეესტრი</h1>
      <p>სისტემაში შესვლა შეუძლიათ მხოლოდ ადმინისტრატორის მიერ ავტორიზებულ თანამშრომლებს.</p>
      ${!configured ? '<p class="error">პროექტი ჯერ არ არის დაკავშირებული მონაცემთა ბაზასთან. მიჰყევით README_GE.md ინსტრუქციას.</p>' : ""}
      <form id="loginForm">
        <label class="required" for="email">ელფოსტა</label>
        <input id="email" name="email" type="email" autocomplete="username" required>
        <label class="required" for="password" style="margin-top:14px">პაროლი</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
        <div class="actions"><button class="btn primary" ${!configured ? "disabled" : ""}>შესვლა</button></div>
        <p id="message" aria-live="polite"></p>
      </form>
    </main>`;
  document.querySelector("#loginForm")?.addEventListener("submit", login);
}

async function login(event) {
  event.preventDefault();
  const fd = new FormData(event.currentTarget);
  const { error } = await supabase.auth.signInWithPassword({
    email: String(fd.get("email")).trim(),
    password: String(fd.get("password"))
  });
  if (error) {
    notify(`შესვლა ვერ მოხერხდა: ${error.message}`, "error");
  }
}

async function loadProfile() {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
  if (error || !data?.active) {
    await supabase.auth.signOut();
    throw new Error("ანგარიში არ არის აქტიური.");
  }
  profile = data;
}

function renderShell() {
  const roleViews = {
    admin: [
      ["form", "ახალი ჩანაწერი"],
      ["registry", "თვიური რეესტრი"],
      ["users", "მომხმარებლები"]
    ],
    reviewer: [["registry", "თვიური რეესტრი"]],
    doctor: [["form", "ახალი ჩანაწერი"]]
  };
  const views = roleViews[profile.role] || [];
  const initialView = views[0]?.[0];

  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand">პაციენტის კომუნიკაციის რეესტრი</div>
        <div class="session"><small>${esc(profile.full_name)} · ${esc(profile.role)}</small><button class="btn" id="logoutBtn">გასვლა</button></div>
      </header>
      <main class="container">
        <nav class="tabs no-print">
          ${views.map(([view, label], index) => `<button class="tab ${index === 0 ? "active" : ""}" data-view="${view}">${label}</button>`).join("")}
        </nav>
        <section id="view">${initialView ? "" : '<div class="card"><p class="error">ამ ანგარიშს მოქმედი როლი არ აქვს.</p></div>'}</section>
      </main>
    </div>
    <div id="modalRoot"></div>`;
  document.querySelector("#logoutBtn").onclick = () => supabase.auth.signOut();
  document.querySelectorAll(".tab").forEach(btn => btn.onclick = () => switchView(btn.dataset.view));
  if (initialView) switchView(initialView);
}

function switchView(view) {
  const allowed = {
    admin: ["form", "registry", "users"],
    reviewer: ["registry"],
    doctor: ["form"]
  };
  if (!(allowed[profile.role] || []).includes(view)) {
    document.querySelector("#view").innerHTML = '<div class="card"><p class="error">ამ განყოფილებაზე წვდომა არ გაქვთ.</p></div>';
    return;
  }
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x.dataset.view === view));
  if (view === "form") renderForm();
  if (view === "registry") renderRegistry();
  if (view === "users") renderUsers();
}

function renderForm() {
  document.querySelector("#view").innerHTML = `
    <div class="card">
      <h1>ახალი კომუნიკაციის ჩანაწერი</h1>
      <p>ვარსკვლავით მონიშნული ველები სავალდებულოა.</p>
      <form id="recordForm">
        <fieldset><legend>პაციენტი და მკურნალობა</legend><div class="grid three">
          ${input("patient_name","პაციენტის სახელი და გვარი",true)}
          ${input("history_number","ისტორიის ნომერი",true)}
          ${input("admission_date","შემოსვლის თარიღი",true,"date")}
          ${input("department","განყოფილება",true)}
          ${input("doctor_name","მკურნალი ექიმი",true)}
        </div></fieldset>
        <fieldset><legend>საკონტაქტო პირი</legend><div class="grid">
          ${input("contact_name","სახელი და გვარი",true)}
          ${input("contact_details","ტელეფონი ან სხვა იდენტიფიკატორი",true)}
          ${input("relationship","კავშირი პაციენტთან",true)}
          ${select("authority_basis","ინფორმაციის მიღების საფუძველი",["პაციენტის თანხმობა","კანონიერი წარმომადგენლობა","პაციენტს თანხმობის გაცემა არ შეუძლია","კანონით გათვალისწინებული სხვა საფუძველი"],true)}
        </div><p class="notice">საკონტაქტო პირად მითითება თავისთავად სამედიცინო ინფორმაციის მიღების უფლებას არ ნიშნავს.</p></fieldset>
        <fieldset><legend>კომუნიკაცია</legend><div class="grid">
          ${input("communication_at","კომუნიკაციის თარიღი და დრო",true,"datetime-local")}
          ${select("channel","არხი",["პირისპირ","ტელეფონი","ვიდეოკავშირი","წერილობითი / ელექტრონული"],true)}
          ${input("reason","კომუნიკაციის მიზეზი")}
          ${input("staff_name","ინფორმაციის მიმწოდებელი",true,"text",profile.full_name)}
          ${area("information_summary","მიწოდებული ინფორმაციის არსებითი შინაარსი",true)}
          ${select("understanding","გაგების შემოწმება",["გაიგო — საკუთარი სიტყვებით სწორად გადმოსცა","ნაწილობრივ გაიგო — დამატებით განემარტა","ვერ დადასტურდა — მიზეზი აღწერილია"],true)}
          ${area("questions_answers","კითხვები და პასუხები")}
          ${area("agreed_actions","გადაწყვეტილება / შეთანხმებული შემდეგი ნაბიჯი",true)}
          ${input("next_update","შემდეგი განახლება / საკონტაქტო გეგმა")}
        </div></fieldset>
        <p class="notice">ეს ჩანაწერი არ ცვლის კონკრეტული პროცედურისთვის საჭირო ინფორმირებულ თანხმობას.</p>
        <div class="actions"><button type="reset" class="btn">გასუფთავება</button><button class="btn primary">ჩანაწერის შენახვა</button></div>
        <p id="message" aria-live="polite"></p>
      </form>
    </div>`;
  const dt = document.querySelector('[name="communication_at"]');
  dt.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,16);
  document.querySelector("#recordForm").onsubmit = saveRecord;
}

function input(name, label, required = false, type = "text", value = "") {
  return `<div><label class="${required ? "required" : ""}" for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""}></div>`;
}
function area(name, label, required = false) {
  return `<div class="wide"><label class="${required ? "required" : ""}" for="${name}">${label}</label><textarea id="${name}" name="${name}" ${required ? "required" : ""}></textarea></div>`;
}
function select(name, label, options, required = false) {
  return `<div><label class="${required ? "required" : ""}" for="${name}">${label}</label><select id="${name}" name="${name}" ${required ? "required" : ""}><option value="">აირჩიეთ</option>${options.map(x => `<option>${x}</option>`).join("")}</select></div>`;
}

async function saveRecord(event) {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  const values = Object.fromEntries(new FormData(event.currentTarget));
  values.created_by = session.user.id;
  const { error } = await supabase.from("communication_records").insert(values);
  button.disabled = false;
  if (error) return notify(`ჩანაწერი ვერ შეინახა: ${error.message}`, "error");
  event.currentTarget.reset();
  document.querySelector('[name="staff_name"]').value = profile.full_name;
  notify("ჩანაწერი წარმატებით შეინახა.");
}

async function renderRegistry() {
  document.querySelector("#view").innerHTML = `
    <div class="card">
      <h1>თვიური შემაჯამებელი რეესტრი</h1>
      <div class="toolbar no-print">
        <div><label for="month">თვე</label><input id="month" type="month" value="${monthValue()}"></div>
        <div><label for="search">ძებნა</label><input id="search" placeholder="პაციენტი, ისტორია, ექიმი"></div>
        <button class="btn" id="exportBtn">CSV ექსპორტი</button><button class="btn" onclick="window.print()">ბეჭდვა / PDF</button>
      </div>
      <div id="registryContent"><p>იტვირთება…</p></div>
    </div>`;
  document.querySelector("#month").onchange = loadRecords;
  document.querySelector("#search").oninput = drawTable;
  document.querySelector("#exportBtn").onclick = exportCsv;
  await loadRecords();
}

async function loadRecords() {
  const month = document.querySelector("#month").value;
  const start = `${month}-01T00:00:00`;
  const endDate = new Date(`${month}-01T00:00:00`);
  endDate.setMonth(endDate.getMonth() + 1);
  const request = profile.role === "reviewer"
    ? supabase.rpc("get_monthly_registry", {
      p_start: start,
      p_end: endDate.toISOString()
    })
    : supabase.from("communication_records").select("*")
      .gte("communication_at", start).lt("communication_at", endDate.toISOString())
      .order("communication_at", { ascending: false });
  const { data, error } = await request;
  if (error) {
    document.querySelector("#registryContent").innerHTML = `<p class="error">${esc(error.message)}</p>`;
    return;
  }
  records = data || [];
  drawTable();
}

function filteredRecords() {
  const q = (document.querySelector("#search")?.value || "").trim().toLowerCase();
  if (!q) return records;
  return records.filter(r => [r.patient_name, r.history_number, r.department, r.doctor_name, r.contact_name].some(v => (v || "").toLowerCase().includes(q)));
}

function drawTable() {
  const data = filteredRecords();
  const canViewFullRecord = profile.role === "admin";
  const departments = new Set(data.map(x => x.department)).size;
  const doctors = new Set(data.map(x => x.doctor_name)).size;
  document.querySelector("#registryContent").innerHTML = `
    <div class="stats"><div class="stat"><b>${data.length}</b>ჩანაწერი</div><div class="stat"><b>${departments}</b>განყოფილება</div><div class="stat"><b>${doctors}</b>ექიმი</div></div>
    <div class="table-wrap"><table><thead><tr>
      <th>კომუნიკაცია</th><th>პაციენტი</th><th>ისტორიის №</th><th>შემოსვლა</th><th>განყოფილება</th><th>ექიმი</th><th>საკონტაქტო პირი</th>
      ${canViewFullRecord ? '<th class="no-print">სრული ფორმა</th>' : ""}
    </tr></thead><tbody>${data.length ? data.map(r => `<tr>
      <td>${dateKa(r.communication_at,true)}</td><td>${esc(r.patient_name)}</td><td>${esc(r.history_number)}</td>
      <td>${dateKa(r.admission_date)}</td><td>${esc(r.department)}</td><td>${esc(r.doctor_name)}</td><td>${esc(r.contact_name)}</td>
      ${canViewFullRecord ? `<td class="no-print"><button class="link-btn" data-id="${r.id}">ნახვა</button></td>` : ""}
      </tr>`).join("") : `<tr><td colspan="${canViewFullRecord ? 8 : 7}">ამ თვეში ჩანაწერი არ მოიძებნა.</td></tr>`}</tbody></table></div>`;
  if (canViewFullRecord) {
    document.querySelectorAll("[data-id]").forEach(btn => btn.onclick = () => showRecord(btn.dataset.id));
  }
}

function showRecord(id) {
  if (profile.role !== "admin") return;
  const r = records.find(x => x.id === id);
  if (!r) return;
  document.querySelector("#modalRoot").innerHTML = `<div class="modal" id="recordModal"><div class="modal-card">
    <h2>კომუნიკაციის სრული ჩანაწერი</h2>
    <div class="detail-grid">${Object.entries(labels).map(([key,label]) => `<div class="detail ${["information_summary","questions_answers","agreed_actions"].includes(key) ? "wide" : ""}"><b>${label}</b>${esc(key.includes("date") || key.endsWith("_at") ? dateKa(r[key], key.endsWith("_at")) : r[key] || "—")}</div>`).join("")}</div>
    <div class="actions">
      ${profile.role === "admin" ? '<button class="btn danger" id="deleteRecord">ჩანაწერის წაშლა</button>' : ""}
      <button class="btn" id="printRecord">ბეჭდვა</button>
      <button class="btn primary" id="closeModal">დახურვა</button>
    </div>
  </div></div>`;
  document.querySelector("#closeModal").onclick = () => document.querySelector("#modalRoot").innerHTML = "";
  document.querySelector("#printRecord").onclick = () => window.print();
  document.querySelector("#deleteRecord")?.addEventListener("click", () => deleteRecord(r));
}

async function deleteRecord(record) {
  if (profile.role !== "admin") return;
  const confirmed = confirm(
    `ნამდვილად წაიშალოს ${record.patient_name}-ის ჩანაწერი (ისტორიის № ${record.history_number})?\n\nეს მოქმედება შეუქცევადია.`
  );
  if (!confirmed) return;

  const { error } = await supabase
    .from("communication_records")
    .delete()
    .eq("id", record.id);

  if (error) {
    alert(`ჩანაწერის წაშლა ვერ მოხერხდა: ${error.message}`);
    return;
  }

  document.querySelector("#modalRoot").innerHTML = "";
  await loadRecords();
}

function csvCell(value) { return `"${String(value ?? "").replaceAll('"','""')}"`; }
function exportCsv() {
  const columns = ["communication_at","patient_name","history_number","admission_date","department","doctor_name","contact_name"];
  const rows = [columns.map(x => csvCell(labels[x])).join(","), ...filteredRecords().map(r => columns.map(x => csvCell(r[x])).join(","))];
  const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `communication_registry_${document.querySelector("#month").value}.csv`; a.click(); URL.revokeObjectURL(a.href);
}

async function renderUsers() {
  document.querySelector("#view").innerHTML = `<div class="card"><h1>ავტორიზებული მომხმარებლები</h1>
    <p>ახალი მომხმარებელი ჯერ მოიწვიეთ Supabase-ის Authentication პანელიდან; შემდეგ აქ მიანიჭეთ როლი.</p>
    <div id="usersContent"><p>იტვირთება…</p></div><p id="message"></p></div>`;
  const { data, error } = await supabase.from("profiles").select("*").order("full_name");
  if (error) return document.querySelector("#usersContent").innerHTML = `<p class="error">${esc(error.message)}</p>`;
  document.querySelector("#usersContent").innerHTML = `<div class="table-wrap"><table><thead><tr><th>სახელი</th><th>ელფოსტა</th><th>როლი</th><th>აქტიური</th><th>შენახვა</th></tr></thead><tbody>
    ${data.map(u => `<tr><td><input data-name="${u.id}" value="${esc(u.full_name || "")}"></td><td>${esc(u.email || "")}</td><td><select data-role="${u.id}">
      ${["doctor","reviewer","admin"].map(role => `<option ${u.role===role?"selected":""}>${role}</option>`).join("")}</select></td>
      <td><input type="checkbox" data-active="${u.id}" ${u.active?"checked":""}></td><td><button class="btn" data-save="${u.id}">შენახვა</button></td></tr>`).join("")}
    </tbody></table></div>`;
  document.querySelectorAll("[data-save]").forEach(btn => btn.onclick = () => saveUser(btn.dataset.save));
}

async function saveUser(userId) {
  const payload = {
    target_user: userId,
    new_full_name: document.querySelector(`[data-name="${userId}"]`).value,
    new_role: document.querySelector(`[data-role="${userId}"]`).value,
    new_active: document.querySelector(`[data-active="${userId}"]`).checked
  };
  const { error } = await supabase.rpc("admin_update_profile", payload);
  notify(error ? error.message : "მომხმარებლის უფლებები განახლდა.", error ? "error" : "success");
}

async function start() {
  if (!supabase) return renderLogin();
  const { data } = await supabase.auth.getSession();
  session = data.session;
  if (session) {
    try { await loadProfile(); renderShell(); } catch (e) { renderLogin(); notify(e.message, "error"); }
  } else renderLogin();
  supabase.auth.onAuthStateChange(async (_event, nextSession) => {
    session = nextSession;
    if (!session) return renderLogin();
    try { await loadProfile(); renderShell(); } catch (e) { renderLogin(); notify(e.message, "error"); }
  });
}
start();
