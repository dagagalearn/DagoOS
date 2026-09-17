/* ==========================================================================
   DagoOS — Dago Academy
   --------------------------------------------------------------------------
   Academic record + skill tracker.

   Firestore collections:
     courses  → name, institution, code, credits, grade, status, semester, notes
     skills   → name, level, progress, notes

   Uses:
     listDocs, addDoc, updateDoc, deleteDoc  → firestore.js
     el, clear, toNumber, formatDate         → utils.js
   ========================================================================== */

import { listDocs, addDoc, updateDoc, deleteDoc } from "../core/firestore.js";
import { el, clear, toNumber, formatDate } from "../core/utils.js";

/* --------------------------------------------------------------------------
   1. STATE
   -------------------------------------------------------------------------- */
const state = {
  courses: [],
  skills: [],
  exams: [],
  editingCourseId: null,
  editingSkillId:  null,
  editingExamId:   null
};
let refs = {};


/* --------------------------------------------------------------------------
   2. ENTRY POINT
   -------------------------------------------------------------------------- */
export async function initAcademy() {
  cacheRefs();
  bindCourseForm();
  bindSkillForm();
  bindExamForm();
  await loadAll();
  renderCourses();
  renderSkills();
  renderExams();
  renderGPA();
}

function cacheRefs() {
  refs = {
    // Courses
    courseForm:     document.getElementById("course-form"),
    courseFormTitle:document.getElementById("course-form-title"),
    courseName:     document.getElementById("course-name"),
    courseInstitution: document.getElementById("course-institution"),
    courseCode:     document.getElementById("course-code"),
    courseCredits:  document.getElementById("course-credits"),
    courseGrade:    document.getElementById("course-grade"),
    courseStatus:   document.getElementById("course-status"),
    courseSemester: document.getElementById("course-semester"),
    courseNotes:    document.getElementById("course-notes"),
    courseSubmit:   document.getElementById("course-submit"),
    courseCancel:   document.getElementById("course-cancel"),
    courseList:     document.getElementById("course-list"),
    courseEmpty:    document.getElementById("course-empty"),
    gpaValue:       document.getElementById("gpa-value"),
    creditsTotal:   document.getElementById("credits-total"),
    coursesCompleted: document.getElementById("courses-completed"),

    // Skills
    skillForm:      document.getElementById("skill-form"),
    skillFormTitle: document.getElementById("skill-form-title"),
    skillName:      document.getElementById("skill-name"),
    skillLevel:     document.getElementById("skill-level"),
    skillProgress:  document.getElementById("skill-progress"),
    skillNotes:     document.getElementById("skill-notes"),
    skillSubmit:    document.getElementById("skill-submit"),
    skillCancel:    document.getElementById("skill-cancel"),
    skillList:      document.getElementById("skill-list"),
    skillEmpty:     document.getElementById("skill-empty")
      // Exams
    examForm:       document.getElementById("exam-form"),
    examFormTitle:  document.getElementById("exam-form-title"),
    examName:       document.getElementById("exam-name"),
    examScore:      document.getElementById("exam-score"),
    examTotal:      document.getElementById("exam-total"),
    examDate:       document.getElementById("exam-date"),
    examDescription:document.getElementById("exam-description"),
    examSubmit:     document.getElementById("exam-submit"),
    examCancel:     document.getElementById("exam-cancel"),
    examList:       document.getElementById("exam-list"),
    examEmpty:      document.getElementById("exam-empty")
  };
}


/* --------------------------------------------------------------------------
   3. LOAD
   -------------------------------------------------------------------------- */
async function loadAll() {
  try {
    state.courses = await listDocs("courses", {
      orderByField: "semester",
      orderDir: "desc"
    });
  } catch (err) {
    console.error("[Academy] Courses load failed:", err);
    state.courses = [];
  }

  try {
    state.skills = await listDocs("skills", {
      orderByField: "name",
      orderDir: "asc"
    });
  } catch (err) {
    console.error("[Academy] Skills load failed:", err);
    state.skills = [];
  }
     try {
    state.skills = await listDocs("skills", {
      orderByField: "name",
      orderDir: "asc"
    });
  } catch (err) {
    console.error("[Academy] Skills load failed:", err);
    state.skills = [];
  }

  try {
    state.exams = await listDocs("exams", {
      orderByField: "date",
      orderDir: "desc"
    });
  } catch (err) {
    console.error("[Academy] Exams load failed:", err);
    state.exams = [];
  }
}
}


/* --------------------------------------------------------------------------
   4. COURSES — render
   -------------------------------------------------------------------------- */
function renderCourses() {
  if (!refs.courseList) return;
  clear(refs.courseList);

  if (state.courses.length === 0) {
    refs.courseEmpty?.classList.remove("hidden");
    return;
  }
  refs.courseEmpty?.classList.add("hidden");

  for (const c of state.courses) {
    refs.courseList.appendChild(buildCourseRow(c));
  }
}


function buildCourseRow(c) {
  const gradeText = c.grade != null && c.grade !== ""
    ? `Grade: ${c.grade}`
    : "In progress";

  const meta = [c.institution, c.code, c.semester, gradeText]
    .filter(Boolean).join(" · ");

  return el("div", { class: "course-row" },
    el("div", { class: "course-row__main" },
      el("div", { class: "course-row__name", text: c.name }),
      el("div", { class: "course-row__meta", text: meta }),
      c.notes ? el("div", { class: "course-row__notes", text: c.notes }) : null
    ),
    el("div", { class: "course-row__credits", text: `${c.credits || 0} EC` }),
    el("button", {
      class: "prop-row__btn",
      type: "button",
      onclick: () => beginEditCourse(c)
    }, "Edit"),
    el("button", {
      class: "prop-row__btn prop-row__btn--danger",
      type: "button",
      onclick: () => handleDeleteCourse(c.id, c.name)
    }, "Delete")
  );
}


/* --------------------------------------------------------------------------
   5. GPA — weighted by credits, only for completed courses with numeric grade
   -------------------------------------------------------------------------- */
function renderGPA() {
  let totalCredits = 0;
  let weightedSum  = 0;
  let completedCount = 0;

  for (const c of state.courses) {
    const credits = toNumber(c.credits);
    if (c.status === "completed" && c.grade != null && c.grade !== "") {
      const grade = toNumber(c.grade);
      totalCredits += credits;
      weightedSum  += grade * credits;
      completedCount++;
    }
  }

  const gpa = totalCredits > 0 ? (weightedSum / totalCredits) : 0;

  if (refs.gpaValue)          refs.gpaValue.textContent = gpa.toFixed(2);
  if (refs.creditsTotal)      refs.creditsTotal.textContent = totalCredits;
  if (refs.coursesCompleted)  refs.coursesCompleted.textContent = completedCount;
}


/* --------------------------------------------------------------------------
   6. COURSE FORM
   -------------------------------------------------------------------------- */
function bindCourseForm() {
  if (!refs.courseForm) return;

  refs.courseForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const gradeRaw = refs.courseGrade.value.trim();
    const data = {
      name:        (refs.courseName.value || "").trim(),
      institution: (refs.courseInstitution.value || "").trim(),
      code:        (refs.courseCode.value || "").trim(),
      credits:     toNumber(refs.courseCredits.value, 0),
      grade:       gradeRaw === "" ? null : toNumber(gradeRaw),
      status:      refs.courseStatus.value,
      semester:    (refs.courseSemester.value || "").trim(),
      notes:       (refs.courseNotes.value || "").trim()
    };

    if (!data.name) return alert("Course name is required.");

    try {
      if (state.editingCourseId) {
        await updateDoc("courses", state.editingCourseId, data);
      } else {
        await addDoc("courses", data);
      }
      resetCourseForm();
      await loadAll();
      renderCourses();
      renderGPA();
    } catch (err) {
      console.error("[Academy] Course save failed:", err);
      alert("Could not save course. Check console.");
    }
  });

  refs.courseCancel?.addEventListener("click", resetCourseForm);
}


function beginEditCourse(c) {
  state.editingCourseId = c.id;
  refs.courseName.value        = c.name || "";
  refs.courseInstitution.value = c.institution || "";
  refs.courseCode.value        = c.code || "";
  refs.courseCredits.value     = c.credits ?? "";
  refs.courseGrade.value       = c.grade ?? "";
  refs.courseStatus.value      = c.status || "completed";
  refs.courseSemester.value    = c.semester || "";
  refs.courseNotes.value       = c.notes || "";

  refs.courseFormTitle.textContent = "Edit course";
  refs.courseSubmit.textContent    = "Save changes";
  refs.courseCancel?.classList.remove("hidden");
  refs.courseForm.scrollIntoView({ behavior: "smooth", block: "start" });
}


function resetCourseForm() {
  state.editingCourseId = null;
  refs.courseForm.reset();
  refs.courseFormTitle.textContent = "Add course";
  refs.courseSubmit.textContent    = "Add course";
  refs.courseCancel?.classList.add("hidden");
}


async function handleDeleteCourse(id, name) {
  if (!confirm(`Delete "${name}"?`)) return;
  try {
    await deleteDoc("courses", id);
    if (state.editingCourseId === id) resetCourseForm();
    await loadAll();
    renderCourses();
    renderGPA();
  } catch (err) {
    console.error("[Academy] Course delete failed:", err);
  }
}


/* --------------------------------------------------------------------------
   7. SKILLS — render
   -------------------------------------------------------------------------- */
function renderSkills() {
  if (!refs.skillList) return;
  clear(refs.skillList);

  if (state.skills.length === 0) {
    refs.skillEmpty?.classList.remove("hidden");
    return;
  }
  refs.skillEmpty?.classList.add("hidden");

  for (const s of state.skills) {
    refs.skillList.appendChild(buildSkillRow(s));
  }
}


function buildSkillRow(s) {
  const progress = Math.max(0, Math.min(100, toNumber(s.progress, 0)));

  return el("div", { class: "skill-row" },
    el("div", { class: "skill-row__header" },
      el("div", { class: "skill-row__name", text: s.name }),
      el("div", { class: "skill-row__level", text: (s.level || "").toUpperCase() })
    ),
    el("div", { class: "skill-row__bar" },
      el("div", {
        class: "skill-row__bar-fill",
        style: `width: ${progress}%`
      })
    ),
    el("div", { class: "skill-row__footer" },
      el("span", { class: "skill-row__progress", text: `${progress}%` }),
      el("div", { class: "skill-row__actions" },
        el("button", {
          class: "prop-row__btn",
          type: "button",
          onclick: () => beginEditSkill(s)
        }, "Edit"),
        el("button", {
          class: "prop-row__btn prop-row__btn--danger",
          type: "button",
          onclick: () => handleDeleteSkill(s.id, s.name)
        }, "Delete")
      )
    ),
    s.notes ? el("div", { class: "skill-row__notes", text: s.notes }) : null
  );
}


/* --------------------------------------------------------------------------
   8. SKILL FORM
   -------------------------------------------------------------------------- */
function bindSkillForm() {
  if (!refs.skillForm) return;

  refs.skillForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const data = {
      name:     (refs.skillName.value || "").trim(),
      level:    refs.skillLevel.value,
      progress: Math.max(0, Math.min(100, toNumber(refs.skillProgress.value, 0))),
      notes:    (refs.skillNotes.value || "").trim()
    };

    if (!data.name) return alert("Skill name is required.");

    try {
      if (state.editingSkillId) {
        await updateDoc("skills", state.editingSkillId, data);
      } else {
        await addDoc("skills", data);
      }
      resetSkillForm();
      await loadAll();
      renderSkills();
    } catch (err) {
      console.error("[Academy] Skill save failed:", err);
      alert("Could not save skill. Check console.");
    }
  });

  refs.skillCancel?.addEventListener("click", resetSkillForm);
}


function beginEditSkill(s) {
  state.editingSkillId = s.id;
  refs.skillName.value     = s.name || "";
  refs.skillLevel.value    = s.level || "beginner";
  refs.skillProgress.value = s.progress ?? 0;
  refs.skillNotes.value    = s.notes || "";

  refs.skillFormTitle.textContent = "Edit skill";
  refs.skillSubmit.textContent    = "Save changes";
  refs.skillCancel?.classList.remove("hidden");
  refs.skillForm.scrollIntoView({ behavior: "smooth", block: "start" });
}


function resetSkillForm() {
  state.editingSkillId = null;
  refs.skillForm.reset();
  refs.skillProgress.value = 0;
  refs.skillFormTitle.textContent = "Add skill";
  refs.skillSubmit.textContent    = "Add skill";
  refs.skillCancel?.classList.add("hidden");
}


async function handleDeleteSkill(id, name) {
  if (!confirm(`Delete "${name}"?`)) return;
  try {
    await deleteDoc("skills", id);
    if (state.editingSkillId === id) resetSkillForm();
    await loadAll();
    renderSkills();
  } catch (err) {
    console.error("[Academy] Skill delete failed:", err);
  }
   
}

/* ==========================================================================
   EXAMS — individual exams with scores
   --------------------------------------------------------------------------
   Firestore collection: `exams`
   Doc shape: { name, score, total, description, date, uid, timestamps }

   Percentage is computed on the fly (not stored) so edits always stay
   consistent.
   ========================================================================== */

function renderExams() {
  if (!refs.examList) return;
  clear(refs.examList);

  if (state.exams.length === 0) {
    refs.examEmpty?.classList.remove("hidden");
    return;
  }
  refs.examEmpty?.classList.add("hidden");

  for (const ex of state.exams) {
    refs.examList.appendChild(buildExamRow(ex));
  }
}


function buildExamRow(ex) {
  const score = toNumber(ex.score);
  const total = toNumber(ex.total);
  const pct   = total > 0 ? (score / total) * 100 : 0;
  const pctText = total > 0 ? `${pct.toFixed(1)}%` : "—";

  // Color the percentage based on performance
  let pctClass = "exam-row__pct--ok";
  if (pct >= 80)      pctClass = "exam-row__pct--great";
  else if (pct >= 60) pctClass = "exam-row__pct--ok";
  else                pctClass = "exam-row__pct--low";

  const meta = [
    total > 0 ? `${score} / ${total}` : "",
    ex.date ? formatDate(ex.date) : ""
  ].filter(Boolean).join(" · ");

  return el("div", { class: "exam-row" },
    el("div", { class: "exam-row__main" },
      el("div", { class: "exam-row__name", text: ex.name }),
      el("div", { class: "exam-row__meta", text: meta }),
      ex.description
        ? el("div", { class: "exam-row__desc", text: ex.description })
        : null
    ),
    el("div", { class: `exam-row__pct ${pctClass}`, text: pctText }),
    el("button", {
      class: "prop-row__btn",
      type: "button",
      onclick: () => beginEditExam(ex)
    }, "Edit"),
    el("button", {
      class: "prop-row__btn prop-row__btn--danger",
      type: "button",
      onclick: () => handleDeleteExam(ex.id, ex.name)
    }, "Delete")
  );
}


function bindExamForm() {
  if (!refs.examForm) return;

  refs.examForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const total = toNumber(refs.examTotal.value, 0);
    if (total <= 0) return alert("Total must be greater than zero.");

    const data = {
      name:        (refs.examName.value || "").trim(),
      score:       toNumber(refs.examScore.value, 0),
      total:       total,
      description: (refs.examDescription.value || "").trim(),
      date:        refs.examDate.value || ""
    };

    if (!data.name) return alert("Exam name is required.");

    try {
      if (state.editingExamId) {
        await updateDoc("exams", state.editingExamId, data);
      } else {
        await addDoc("exams", data);
      }
      resetExamForm();
      await loadAll();
      renderExams();
    } catch (err) {
      console.error("[Academy] Exam save failed:", err);
      alert("Could not save exam. Check console.");
    }
  });

  refs.examCancel?.addEventListener("click", resetExamForm);
}


function beginEditExam(ex) {
  state.editingExamId = ex.id;
  refs.examName.value        = ex.name || "";
  refs.examScore.value       = ex.score ?? "";
  refs.examTotal.value       = ex.total ?? "";
  refs.examDescription.value = ex.description || "";
  refs.examDate.value        = ex.date || "";

  refs.examFormTitle.textContent = "Edit exam";
  refs.examSubmit.textContent    = "Save changes";
  refs.examCancel?.classList.remove("hidden");
  refs.examForm.scrollIntoView({ behavior: "smooth", block: "start" });
}


function resetExamForm() {
  state.editingExamId = null;
  refs.examForm.reset();
  refs.examFormTitle.textContent = "Add exam";
  refs.examSubmit.textContent    = "Add exam";
  refs.examCancel?.classList.add("hidden");
}


async function handleDeleteExam(id, name) {
  if (!confirm(`Delete "${name}"?`)) return;
  try {
    await deleteDoc("exams", id);
    if (state.editingExamId === id) resetExamForm();
    await loadAll();
    renderExams();
  } catch (err) {
    console.error("[Academy] Exam delete failed:", err);
  }
}
