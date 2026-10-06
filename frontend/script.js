const $ = (id) => document.getElementById(id);
const charts = {};
const fmt = (n) => Math.round(n).toLocaleString("en-IN");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Theme ----------
function currentTheme() {
  return document.documentElement.dataset.theme;
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("theme", theme); } catch { /* storage blocked */ }
}
$("theme-toggle").addEventListener("click", () => {
  applyTheme(currentTheme() === "dark" ? "light" : "dark");
  renderAllCharts(false);
});

// ---------- Helpers ----------
function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Count a number up from 0 with an ease-out curve
function countUp(el, to, { decimals = 0, duration = 900, format } = {}) {
  const show = (v) => (el.textContent = format ? format(v) : v.toFixed(decimals));
  if (reduceMotion) return show(to);
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    show(to * (1 - Math.pow(1 - t, 4)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function dietValue() {
  return document.querySelector('input[name="diet"]:checked').value;
}

// ---------- Charts ----------
if (typeof Chart !== "undefined") {
  Chart.defaults.font.family = "'Geist', system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.animation.duration = reduceMotion ? 0 : 1000;
  Chart.defaults.animation.easing = "easeOutQuart";
}

function drawChart(key, canvasId, config, animate = true) {
  if (typeof Chart === "undefined") return;
  if (charts[key]) charts[key].destroy();
  const text = css("--muted");
  const grid = css("--line");
  const opts = (config.options = Object.assign({ responsive: true, maintainAspectRatio: false }, config.options));
  if (!animate) opts.animation = false;
  opts.plugins = Object.assign({ legend: { display: false } }, opts.plugins);
  opts.plugins.legend.labels = Object.assign({ color: text, usePointStyle: true, pointStyle: "circle", padding: 16 }, opts.plugins.legend.labels);
  opts.plugins.tooltip = {
    backgroundColor: css("--text"), titleColor: css("--bg"), bodyColor: css("--bg"),
    padding: 10, cornerRadius: 8, displayColors: false,
    titleFont: { weight: "600" }, bodyFont: { family: "'Geist Mono', monospace" }
  };
  if (config.type !== "doughnut") {
    const axis = { ticks: { color: text }, grid: { color: grid, drawTicks: false }, border: { display: false } };
    opts.scales = {
      x: Object.assign({}, axis, { grid: { display: config.options.indexAxis === "y" ? true : false, color: grid } }),
      y: Object.assign({}, axis, { beginAtZero: true, grid: { display: config.options.indexAxis === "y" ? false : true, color: grid } })
    };
  }
  charts[key] = new Chart($(canvasId), config);
}

// ---------- Facts and charts ----------
function renderFacts() {
  $("fact-grid").innerHTML = DATA.facts
    .map((f, i) => `<div class="fact" data-reveal style="--d:${i}"><b data-count="${f.big}">${f.big}</b><span>${f.text}</span></div>`)
    .join("");
}

// Animate the numeric part of strings like "2.4 billion" or "~1.1 °C"
function countFact(el) {
  const m = el.dataset.count.match(/^(\D*)([\d.]+)(.*)$/);
  if (!m) return;
  const [, pre, num, post] = m;
  const decimals = (num.split(".")[1] || "").length;
  countUp(el, parseFloat(num), { duration: 1400, format: (v) => pre + v.toFixed(decimals) + post });
}

let factChartsShown = false;
function renderFactCharts(animate = true) {
  const warm = css("--warm");
  drawChart("temp", "chart-temp", {
    type: "line",
    data: {
      labels: DATA.temperature.labels,
      datasets: [{
        data: DATA.temperature.values, borderColor: warm, borderWidth: 2.5, tension: 0.35,
        pointRadius: 3, pointBackgroundColor: warm, fill: true,
        backgroundColor: (ctx) => {
          const { chartArea, ctx: c } = ctx.chart;
          if (!chartArea) return "transparent";
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, warm + "40");
          g.addColorStop(1, warm + "00");
          return g;
        }
      }]
    }
  }, animate);
  drawChart("plastic", "chart-plastic", {
    type: "bar",
    data: { labels: DATA.plastic.labels, datasets: [{ data: DATA.plastic.values, backgroundColor: css("--c2"), borderRadius: 6, maxBarThickness: 36 }] }
  }, animate);
  drawChart("countries", "chart-countries", {
    type: "bar",
    data: {
      labels: DATA.countries.labels,
      datasets: [{
        data: DATA.countries.values, borderRadius: 6, maxBarThickness: 26,
        backgroundColor: DATA.countries.labels.map((l) => (l === "India" ? css("--c1") : css("--c3")))
      }]
    },
    options: { indexAxis: "y" }
  }, animate);
}

// ---------- Carbon calculator ----------
let carbonResult = null;

function num(id) {
  const v = parseFloat($(id).value);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function calcCarbon() {
  const c = DATA.carbon;
  const members = Math.max(1, num("members"));
  let travelKg = 0;
  document.querySelectorAll("[data-mode]").forEach((el) => {
    const km = Math.max(0, parseFloat(el.value) || 0);
    travelKg += km * 52 * c.transport[el.dataset.mode];
  });
  travelKg += num("flight-km") * c.transport.flight;

  const homeKg = (num("kwh") * 12 * c.gridKgPerKwh) / members;
  const foodKg = c.dietTonnes[dietValue()] * 1000;
  const recycled = Math.min(100, num("recycle")) / 100;
  const wasteKg = num("waste") * 52 * c.wasteKgPerKg * (1 - recycled * c.recycleSaving);

  const parts = { Travel: travelKg, Home: homeKg, Food: foodKg, Waste: wasteKg };
  const total = (travelKg + homeKg + foodKg + wasteKg) / 1000;
  return { parts, total };
}

function tipsHtml(items) {
  return items.map((t, i) => `<li style="--i:${i}">${t}</li>`).join("");
}

function renderCarbon(animate = true) {
  if (!carbonResult) return;
  const { parts, total } = carbonResult;
  $("carbon-result").classList.remove("is-empty");
  if (animate) countUp($("carbon-total"), total, { decimals: 2 });
  else $("carbon-total").textContent = total.toFixed(2);

  const { India, World } = DATA.carbon.averages;
  $("carbon-compare").textContent =
    `That is ${(total / India).toFixed(1)}× the India average (${India} t) and ${(total / World).toFixed(1)}× the world average (${World} t).`;

  // Show "You" in the hero comparison (scaled against the USA bar)
  const you = $("hero-you");
  you.style.setProperty("--w", `${Math.min(100, (total / 14.9) * 100).toFixed(1)}%`);
  you.querySelector("b").textContent = `${total.toFixed(1)} t`;

  drawChart("carbon", "chart-carbon", {
    type: "doughnut",
    data: {
      labels: Object.keys(parts),
      datasets: [{
        data: Object.values(parts).map((v) => +(v / 1000).toFixed(2)),
        backgroundColor: [css("--c1"), css("--c2"), css("--c3"), css("--c4")],
        borderColor: css("--surface"), borderWidth: 3, hoverOffset: 6
      }]
    },
    options: { cutout: "68%", plugins: { legend: { display: true, position: "right" } } }
  }, animate);

  const biggest = Object.entries(parts).sort((a, b) => b[1] - a[1])[0][0];
  const tips = {
    Travel: ["Use public transport or share rides for your longest regular trip.", "Walk or cycle for short distances.", "Take the train instead of a flight where you can."],
    Home: ["Switch to LED bulbs and 5-star appliances.", "Switch off devices at the plug, not just on standby.", "Consider rooftop solar or a green energy plan."],
    Food: ["Add a few meat-free days each week.", "Buy local and seasonal food.", "Plan meals to avoid food waste."],
    Waste: ["Segregate wet and dry waste.", "Compost kitchen waste at home.", "Refuse single-use plastic."]
  };
  $("carbon-tips").innerHTML = tipsHtml([`<b>Your biggest source is ${biggest.toLowerCase()}.</b>`, ...tips[biggest]]);
}

$("carbon-form").addEventListener("submit", (e) => {
  e.preventDefault();
  carbonResult = calcCarbon();
  renderCarbon();
});

// Segmented diet control: slide the thumb to the checked option
const segInputs = [...document.querySelectorAll('input[name="diet"]')];
function moveSegThumb() {
  document.querySelector(".segmented").style.setProperty("--seg", segInputs.findIndex((i) => i.checked));
}
segInputs.forEach((i) => i.addEventListener("change", moveSegThumb));
moveSegThumb();

// ---------- Water calculator ----------
let waterResult = null;

function buildWaterForm() {
  $("water-items").innerHTML = DATA.water
    .map((w) => `<div class="w-item">
        <span class="name" id="wl-${w.id}">${w.name}<small>per ${w.unit} · ${fmt(w.litres)} L</small></span>
        <span class="stepper">
          <button type="button" data-step="-1" aria-label="Fewer ${w.name}">−</button>
          <input type="number" min="0" value="0" inputmode="numeric" data-water="${w.id}" aria-labelledby="wl-${w.id}">
          <button type="button" data-step="1" aria-label="More ${w.name}">+</button>
        </span>
      </div>`)
    .join("");
}

$("water-items").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-step]");
  if (!btn) return;
  const input = btn.parentElement.querySelector("input");
  input.value = Math.max(0, (parseFloat(input.value) || 0) + Number(btn.dataset.step));
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
$("water-items").addEventListener("input", (e) => {
  if (e.target.matches("[data-water]")) {
    e.target.parentElement.classList.toggle("has-value", parseFloat(e.target.value) > 0);
  }
});

// Number boxes: clear the default 0 when you start typing, put it back if left empty
document.addEventListener("focusin", (e) => {
  if (e.target.matches('input[type="number"]') && e.target.value === "0") e.target.value = "";
});
document.addEventListener("focusout", (e) => {
  if (e.target.matches('input[type="number"]') && e.target.value === "") e.target.value = e.target.defaultValue;
});

function calcWater() {
  const items = [];
  document.querySelectorAll("[data-water]").forEach((el) => {
    const qty = Math.max(0, parseFloat(el.value) || 0);
    const item = DATA.water.find((w) => w.id === el.dataset.water);
    if (qty > 0) items.push({ item, litres: qty * item.litres });
  });
  items.sort((a, b) => b.litres - a.litres);
  return { items, total: items.reduce((s, i) => s + i.litres, 0) };
}

// Fill the drop: log scale so 100 L and 50,000 L both read clearly
function setDropLevel(total) {
  const p = total > 0 ? Math.min(1, Math.log10(1 + total) / Math.log10(1 + 60000)) : 0.08;
  $("drop-level").style.transform = `translateY(${126 - p * 118}px)`;
}

function renderWater(animate = true) {
  if (!waterResult) return;
  const { items, total } = waterResult;
  setDropLevel(total);
  if (!items.length) {
    $("water-result").classList.add("is-empty");
    $("water-total").textContent = "–";
    $("water-compare").textContent = "Add at least one item using the + buttons.";
    $("water-tips").innerHTML = "";
    if (charts.water) { charts.water.destroy(); delete charts.water; }
    return;
  }
  $("water-result").classList.remove("is-empty");
  if (animate) countUp($("water-total"), total, { format: fmt });
  else $("water-total").textContent = fmt(total);
  const days = total / DATA.drinkingLitresPerDay;
  $("water-compare").textContent =
    `Enough drinking water for one person for about ${fmt(days)} days (${(days / 365).toFixed(1)} years).`;

  drawChart("water", "chart-water", {
    type: "bar",
    data: {
      labels: items.map((i) => i.item.name),
      datasets: [{ data: items.map((i) => i.litres), backgroundColor: items.map((_, i) => (i === 0 ? css("--water") : css("--water-3"))), borderRadius: 6, maxBarThickness: 22 }]
    },
    options: { indexAxis: "y" }
  }, animate);
  $("water-tips").innerHTML = tipsHtml([
    `<b>Biggest item: ${items[0].item.name}.</b> ${items[0].item.swap}`,
    ...(items[1] ? [`${items[1].item.name}: ${items[1].item.swap}`] : [])
  ]);
}

$("water-form").addEventListener("submit", (e) => {
  e.preventDefault();
  waterResult = calcWater();
  renderWater();
});

// ---------- Scroll effects ----------
function renderAllCharts(animate = true) {
  if (factChartsShown) renderFactCharts(animate);
  renderCarbon(animate);
  renderWater(animate);
}

function setupReveal() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("in");
      entry.target.querySelectorAll("[data-count]").forEach(countFact);
      if (entry.target.matches("[data-count]")) countFact(entry.target);
      io.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.1 });
  document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));

  // Draw the data charts when they scroll into view, so their animation is seen
  const chartIo = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && !factChartsShown) {
      factChartsShown = true;
      renderFactCharts();
      chartIo.disconnect();
    }
  }, { threshold: 0.2 });
  chartIo.observe(document.querySelector(".bento"));
}

// Nav: highlight the section in view with a sliding pill
function setupNav() {
  const nav = document.querySelector(".nav");
  const indicator = nav.querySelector(".nav-indicator");
  const links = [...nav.querySelectorAll("a")];
  const header = document.querySelector(".site-header");

  const progress = header.querySelector(".scroll-progress");

  function moveTo(link) {
    links.forEach((l) => l.classList.toggle("active", l === link));
    header.dataset.active = link ? link.getAttribute("href").slice(1) : "";
    if (!link) { indicator.style.opacity = 0; return; }
    indicator.style.opacity = 1;
    indicator.style.width = `${link.offsetWidth}px`;
    indicator.style.transform = `translateX(${link.offsetLeft}px)`;
  }

  const sections = links.map((l) => document.querySelector(l.getAttribute("href")));
  function update() {
    header.classList.toggle("scrolled", scrollY > 8);
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.setProperty("--progress", max > 0 ? Math.min(1, scrollY / max) : 0);
    const mid = innerHeight * 0.35;
    let current = null;
    sections.forEach((s, i) => {
      const r = s.getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) current = links[i];
    });
    moveTo(current);
  }
  let ticking = false;
  addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { update(); ticking = false; });
  }, { passive: true });
  addEventListener("resize", update);
  update();
}

// Mobile menu: toggle, close on link, Escape or outside click
function setupMobileMenu() {
  const btn = $("menu-toggle");
  const menu = $("mobile-menu");
  const setOpen = (open) => {
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", open);
    btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };
  btn.addEventListener("click", () => setOpen(menu.hidden));
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) { setOpen(false); btn.focus(); }
  });
  addEventListener("click", (e) => {
    if (!menu.hidden && !e.target.closest(".site-header")) setOpen(false);
  });
  matchMedia("(min-width: 761px)").addEventListener("change", (e) => { if (e.matches) setOpen(false); });
}

// ---------- Init ----------
$("footer-ask").addEventListener("click", () => {
  if ($("chat-open").getAttribute("aria-expanded") !== "true") $("chat-open").click();
});
setupMobileMenu();
renderFacts();
buildWaterForm();
setupReveal();
setupNav();
if (typeof Chart === "undefined") {
  document.querySelectorAll(".chart-box").forEach((b) => {
    b.innerHTML = '<p class="muted">Charts could not load. Check your internet connection.</p>';
  });
}
