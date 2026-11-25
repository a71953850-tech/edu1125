"use strict";

const DAILY_ALLOWANCE = 25000;
const DAILY_MEALS = 25000;
const DAY_MS = 86400000;
const NIGHT_LIMIT = { seoul: 100000, metro: 80000, other: 70000 };

function travelDays(start, end) {
  return Number.isFinite(start) && Number.isFinite(end) && end >= start
    ? (end - start) / DAY_MS + 1
    : 0;
}

function longStayReduction(days, dailyAmount) {
  const at10Percent = Math.max(Math.min(days, 30) - 15, 0);
  const at20Percent = Math.max(Math.min(days, 60) - 30, 0);
  const at30Percent = Math.max(days - 60, 0);
  return dailyAmount * (at10Percent + 2 * at20Percent + 3 * at30Percent) / 10;
}

function localAllowance(minutes, vehicle) {
  if (vehicle === "assigned") return 0;
  const rate = minutes >= 240 ? 20000 : 10000;
  return rate - (vehicle === "public" ? 10000 : 0);
}

function calculateGeneral(trip) {
  let lodging = 0;
  let lodgingSupplementLimit = 0;
  let spentOnLodging = 0;
  for (const { region, nights, rate } of trip.lodging) {
    const limit = trip.grade === "2" ? NIGHT_LIMIT[region] : rate;
    lodging += Math.min(rate, limit) * nights;
    spentOnLodging += rate * nights;
    const eligibleExcess = Math.min(Math.max(rate - limit, 0), limit * 0.3);
    lodgingSupplementLimit += eligibleExcess * nights;
  }

  const dailyAmount = trip.half ? DAILY_ALLOWANCE / 2 : DAILY_ALLOWANCE;
  const reduction = longStayReduction(trip.stayDays, dailyAmount);
  const mileageBonus = Math.min(DAILY_ALLOWANCE / 2 * trip.days, trip.mileage);
  const lodgingSupplement = Math.min(trip.extraLodging, lodgingSupplementLimit);

  return {
    fare: trip.fare,
    allowance: dailyAmount * trip.days - reduction + mileageBonus,
    lodging: lodging + lodgingSupplement,
    meals: trip.mealDays * DAILY_MEALS,
    reduction,
    mileageBonus,
    lodgingSupplement,
    lodgingSupplementLimit,
    lodgingReduction: spentOnLodging - lodging,
  };
}

const byId = (id) => document.getElementById(id);
const form = byId("trip-form");
const rows = byId("lodging-rows");
const start = byId("start");
const end = byId("end");
const format = new Intl.NumberFormat("ko-KR");
const money = (amount) => `${format.format(amount)}원`;
const readNumber = (id) => byId(id).valueAsNumber || 0;

function isLocal() {
  return form.elements.tripType.value === "local";
}

function addLodgingRow(moveFocus = false) {
  const row = byId("night-template").content.firstElementChild.cloneNode(true);
  rows.append(row);
  if (moveFocus) row.querySelector(".region").focus();
}

function updateInputs() {
  const local = isLocal();
  const days = travelDays(start.valueAsNumber, end.valueAsNumber);
  const grade = byId("grade").value;
  const transport = byId("transport").value;
  const publicCarOnly = transport === "public-car";
  const fareHints = {
    rail: grade === "1" ? "철도 특실 실비를 입력하세요." : "철도 일반실 실비를 입력하세요.",
    bus: "지급 기준에 맞는 버스요금을 입력하세요.",
    private: "철도 또는 버스 기준액을 입력하세요. 공무상 부득이한 이용으로 인정된 경우 연료비·통행료 등의 인정액을 입력하세요.",
    air: "지급 등급과 할인을 적용한 결제 금액을 입력하세요.",
    ship: grade === "1" ? "선박 1등급 실비를 입력하세요." : "선박 2등급 실비를 입력하세요.",
    mixed: "여러 교통수단의 지급 기준에 맞는 금액을 합산하세요. 공용 교통수단 운임은 제외합니다.",
    "public-car": "공무용 차량만 이용하면 운임은 0원이며 일비는 50%로 계산합니다.",
    free: "공용 선박·항공기의 운임은 0원입니다.",
  };

  end.min = start.value;
  byId("local-fields").hidden = byId("local-fields").disabled = !local;
  byId("general-fields").hidden = byId("general-fields").disabled = local;
  byId("fare").disabled = publicCarOnly || transport === "free";
  byId("half").disabled = publicCarOnly;
  byId("fare-hint").textContent = fareHints[transport];
  byId("extra-lodging").disabled = grade === "1";
  byId("mileage").disabled = !["air", "mixed"].includes(transport);

  const waterOrAirOnly = ["air", "ship", "free"].includes(transport);
  const allowMealOverride = transport === "mixed";
  const mealRule = byId("limit-meals");
  byId("water-air").hidden = !waterOrAirOnly && !allowMealOverride;
  mealRule.parentElement.hidden = !allowMealOverride;
  const customMeals = waterOrAirOnly || (allowMealOverride && mealRule.checked);
  byId("meal-fields").hidden = !customMeals;
  byId("meal-days").disabled = !customMeals;
  byId("meal-days").max = days || "";
  byId("stay-days").max = days ? days - 1 : "";
  for (const row of rows.children) {
    row.querySelector(".nights").required = row.querySelector(".night-rate").value !== "";
  }

  const hint = byId("period-hint");
  hint.classList.toggle("ready", Boolean(days));
  hint.textContent = days
    ? `여행일수 ${format.format(days)}일${local ? "" : ` · 입력 가능한 숙박 최대 ${format.format(days - 1)}박`}`
    : "날짜를 입력하면 여행일수를 표시합니다.";
  byId("lodging-hint").textContent = grade === "2"
    ? "1박 상한은 서울 10만원, 광역시 8만원, 그 밖의 지역 7만원입니다. 지역이나 요금이 다르면 행을 추가하세요."
    : "제1호 숙박비는 실비로 계산합니다. 지역이나 요금이 다르면 행을 추가하세요.";
}

function clearError() {
  byId("form-error").hidden = true;
  byId("form-error").textContent = "";
}

function showError(message, field) {
  byId("form-error").textContent = message;
  byId("form-error").hidden = false;
  if (field) {
    const details = field.closest("details");
    if (details) details.open = true;
    field.focus();
    if (!field.validity.valid) field.reportValidity();
  }
}

function renderTraveler() {
  for (const field of ["traveler-name", "traveler-office", "trip-purpose"]) {
    byId(`result-${field}`).textContent = byId(field).value.trim() || "—";
  }
}

function renderResult(period, items, notes, ready = true) {
  const total = items.reduce((sum, [, amount]) => sum + amount, 0);
  byId("total").textContent = ready ? money(total) : "—";
  byId("result-period").textContent = period;
  const dates = byId("result-dates");
  dates.textContent = ready ? `출장일 ${start.value} · 복귀일 ${end.value}` : "";
  dates.hidden = !ready;
  byId("result-traveler").hidden = !ready;
  if (ready) renderTraveler();
  byId("print-result").hidden = !ready;

  byId("breakdown").replaceChildren(...items.map(([label, amount]) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const definition = document.createElement("dd");
    term.textContent = label;
    definition.textContent = ready ? money(amount) : "—";
    row.append(term, definition);
    return row;
  }));

  const list = byId("result-notes");
  list.hidden = notes.length === 0;
  list.replaceChildren(...notes.map((note) => {
    const item = document.createElement("li");
    item.textContent = note;
    return item;
  }));
}

function clearResult() {
  const message = travelDays(start.valueAsNumber, end.valueAsNumber)
    ? "여비 계산하기를 눌러 주세요."
    : "출장 정보를 입력해 주세요.";
  const items = isLocal() ? [["근무지 내 출장여비", 0]] : [["운임", 0], ["일비", 0], ["숙박비", 0], ["식비", 0]];
  renderResult(message, items, [], false);
}

function handleInput(event) {
  if (event?.target.closest("#traveler-fields")) {
    renderTraveler();
    return;
  }
  updateInputs();
  clearError();
  clearResult();
}

function localResult(days) {
  const hours = readNumber("hours");
  const minutes = readNumber("minutes");
  const duration = hours * 60 + minutes;
  if (duration <= 0 || duration > days * 24 * 60) {
    showError("출장 기간에 해당하는 실제 출장 시간을 입력하세요.", byId("hours"));
    return false;
  }
  const vehicle = byId("local-vehicle").value;
  const notes = [];
  notes.push(duration >= 240 ? "4시간 이상 기본 지급액 20,000원" : "4시간 미만 기본 지급액 10,000원");
  if (vehicle === "assigned") notes.push("전용 차량 배정으로 지급액 0원");
  if (vehicle === "public") notes.push("공무용 차량 이용 등으로 10,000원 감액");
  renderResult(`근무지 내 출장 · ${hours}시간 ${minutes}분`, [["출장여비", localAllowance(duration, vehicle)]], notes);
  return true;
}

function generalResult(days) {
  const lodging = [...rows.children].filter((row) => row.querySelector(".night-rate").value !== "").map((row) => ({
    region: row.querySelector(".region").value,
    nights: row.querySelector(".nights").valueAsNumber || 0,
    rate: row.querySelector(".night-rate").valueAsNumber,
    row,
  }));
  const totalNights = lodging.reduce((sum, entry) => sum + entry.nights, 0);
  if (totalNights > days - 1) {
    showError(`숙박 합계는 여행 기간 내 ${days - 1}박까지 입력할 수 있습니다.`, lodging.at(-1).row.querySelector(".nights"));
    return false;
  }

  const mealField = byId("meal-days");
  const trip = {
    days,
    grade: byId("grade").value,
    half: byId("transport").value === "public-car" || byId("half").checked,
    fare: byId("fare").disabled ? 0 : readNumber("fare"),
    stayDays: readNumber("stay-days"),
    mealDays: mealField.disabled ? days : readNumber("meal-days"),
    mileage: byId("mileage").disabled ? 0 : readNumber("mileage"),
    extraLodging: byId("extra-lodging").disabled ? 0 : readNumber("extra-lodging"),
    lodging,
  };
  const result = calculateGeneral(trip);
  const notes = [];
  if (trip.half) notes.push("일비 50% 적용");
  if (result.reduction) notes.push(`동일 지역 장기 체재 일비 ${money(result.reduction)} 감액`);
  if (result.mileageBonus) notes.push(`공적 항공마일리지 일비 ${money(result.mileageBonus)} 추가`);
  if (result.lodgingReduction) notes.push(`숙박 상한 초과액 ${money(result.lodgingReduction)} 차감`);
  if (result.lodgingSupplement) notes.push(`승인된 숙박비 ${money(result.lodgingSupplement)} 추가 반영`);
  if (trip.extraLodging > result.lodgingSupplementLimit) notes.push(`추가 숙박비는 지급 가능 상한 ${money(result.lodgingSupplementLimit)}까지 반영했습니다.`);
  if (!mealField.disabled) notes.push(`식비 지급이 필요한 ${trip.mealDays}일 반영`);
  if ((trip.half && (result.reduction || result.mileageBonus)) || (result.reduction && result.mileageBonus)) {
    notes.push("일비 감액·가산 조건이 함께 적용되어 기관 정산 기준 확인이 필요합니다.");
  }

  renderResult(`${trip.days}일 · 숙박 입력 ${totalNights}박 · 제${trip.grade}호`, [
    ["운임", result.fare], ["일비", result.allowance], ["숙박비", result.lodging], ["식비", result.meals],
  ], notes);
  return true;
}

form.noValidate = true;
form.addEventListener("input", handleInput);
form.addEventListener("change", handleInput);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearError();
  const days = travelDays(start.valueAsNumber, end.valueAsNumber);
  if (!start.value || !end.value) {
    showError("출장일과 복귀일을 모두 입력하세요.", start.value ? end : start);
    return;
  }
  if (!days) {
    showError("복귀일은 출장일과 같거나 이후여야 합니다.", end);
    return;
  }
  const invalid = [...form.elements].find((field) => field.willValidate && !field.validity.valid);
  if (invalid) {
    showError(invalid.validationMessage, invalid);
    return;
  }
  const calculated = isLocal() ? localResult(days) : generalResult(days);
  if (calculated) {
    byId("result").focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 670px)").matches) byId("result").scrollIntoView({ block: "start" });
  }
});

byId("print-result").addEventListener("click", () => window.print());
byId("open-guide").addEventListener("click", () => byId("guide").showModal());
const navToggle = byId("nav-toggle");
navToggle.addEventListener("click", () => {
  navToggle.setAttribute("aria-expanded", String(navToggle.getAttribute("aria-expanded") === "false"));
});
byId("nav-links").addEventListener("click", (event) => {
  if (event.target.closest("a")) navToggle.setAttribute("aria-expanded", "false");
});

byId("add-night").addEventListener("click", () => {
  addLodgingRow(true);
  handleInput();
});

rows.addEventListener("click", (event) => {
  const button = event.target.closest(".remove");
  if (!button) return;
  button.closest(".night-row").remove();
  byId("add-night").focus();
  handleInput();
});

form.addEventListener("reset", () => {
  setTimeout(() => {
    rows.replaceChildren();
    addLodgingRow();
    byId("exceptions").open = false;
    handleInput();
  }, 0);
});

addLodgingRow();
handleInput();
