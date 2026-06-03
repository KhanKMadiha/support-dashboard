/**
 * Support ticket analyser — application logic
 */

const CONFIG = {
  proxyUrl: "https://your-worker.workers.dev/",
  notionPublishUrl: "https://your-worker.workers.dev/notion",
  notionFallbackUrl: "https://www.notion.so/",
  demoNotionPreviewUrl: "https://www.notion.so/help",
  claudeModel: "claude-sonnet-4-20250514",
  strongMatchThreshold: 80,
  nearMissMin: 30,
  analysisDelayMs: 350,
  demoGenerationDelayMs: 900,
  demoPublishDelayMs: 700
};

/**
 * Portfolio demo: steps 1–3 are real (browser-only). KB + Notion are simulated unless
 * ?live=1 (or localhost without ?demo=1). See README for self-hosting.
 */
function resolveDemoMode() {
  const params = new URLSearchParams(location.search);
  if (params.get("live") === "1") return false;
  if (params.get("demo") === "1") return true;
  if (params.get("demo") === "0") return false;

  const host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return false;
  if (host.endsWith(".github.io")) return true;
  if (location.protocol === "file:") return true;
  return true;
}

const IS_DEMO_MODE = resolveDemoMode();

/** Strong match (≥80%) — SSO article in the portfolio catalogue. */
const SAMPLE_TICKET_MATCH = `Subject: SSO login failing for enterprise users

Hi support,

Since this morning several users on our Azure AD SSO integration cannot sign in. They see "SAML assertion invalid" after selecting their organisation. We updated our IdP metadata last week but login worked until today.

Error from browser: SAML Response signature validation failed

Can you help us verify our IdP configuration and attribute mapping?`;

/** Documentation gap (<80%) — surfaces data-export as a related article, not a strong match. */
const SAMPLE_TICKET_GAP = `Subject: GDPR data export request for departing employee

Description: We have a departing employee who has submitted a formal GDPR Subject Access Request for all data held about them on the platform. Our legal team requires a full export of all content, activity logs, comments, and account data associated with their user profile within 30 days.

Error message: No error. Data export functionality not visible in admin settings.

Steps to reproduce:
Log in as admin
Navigate to account settings
Search for data export or GDPR tools
No relevant option found

Impact: Legal compliance deadline in 28 days. Failure to respond risks regulatory action under GDPR Article 15.
Account: Enterprise account, 250 seats`;

const SAMPLE_KIND = { MATCH: "match", GAP: "gap" };

const MATCH_THRESHOLD_NOTE = `Strong matches are at least ${CONFIG.strongMatchThreshold}% keyword relevance against our catalogue.`;

const DOCS_PANEL_TITLE = {
  scanning: "Scanning documentation",
  match: "Documentation found",
  gap: "No strong documentation match"
};

const FLOW_STEP = {
  PASTE: 1,
  MATCH: 2,
  RESPONSE: 3,
  KB: 4
};

const FOOTER_NEXT_LABELS = {
  [FLOW_STEP.PASTE]: "Next",
  [FLOW_STEP.MATCH]: "Next",
  [FLOW_STEP.RESPONSE]: "Next",
  [FLOW_STEP.KB]: "Publish to Notion"
};

const FOOTER_NEXT_ARIA_LABELS = {
  [FLOW_STEP.PASTE]: "Next: analyse ticket and continue",
  [FLOW_STEP.MATCH]: "Next: write your response",
  [FLOW_STEP.RESPONSE]: "Next: generate knowledge base article",
  [FLOW_STEP.KB]: "Publish knowledge base article to Notion"
};

const SIDEBAR_COLLAPSED_KEY = "support-dashboard-sidebar-collapsed";
const DRAFT_STORAGE_KEY = "support-dashboard-draft";
const KEYBOARD_HINT_DISMISSED_KEY = "support-dashboard-keyboard-hint-dismissed";
const MOBILE_BREAKPOINT = 768;

// --- DOM references ---

const appLayout = document.getElementById("app-layout");
const stepSidebar = document.getElementById("step-sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const keyboardHint = document.getElementById("keyboard-hint");
const keyboardHintClose = document.getElementById("keyboard-hint-close");
const srAnnouncer = document.getElementById("sr-announcer");

const step1View = document.getElementById("step-1-view");
const step2View = document.getElementById("step-2-view");
const step3View = document.getElementById("step-3-view");
const step4View = document.getElementById("step-4-view");

const workflowFooter = document.getElementById("workflow-footer");
const footerBackBtn = document.getElementById("footer-back-btn");
const footerNextBtn = document.getElementById("footer-next-btn");
const footerNextLabel = document.getElementById("footer-next-label");
const footerStepCounter = document.getElementById("footer-step-counter");
const kbDownloadBtn = document.getElementById("kb-download-btn");

const ticketEl = document.getElementById("incoming-ticket");
const analyseValidation = document.getElementById("analyse-validation");
const stepItems = document.querySelectorAll(".step-item");
const stepList = document.getElementById("step-list");

const docsPanel = document.getElementById("docs-panel");
const docsPanelTitle = document.getElementById("docs-panel-title");
const docsStatus = document.getElementById("docs-status");
const docsBody = document.getElementById("docs-body");
const relatedArticlesPanel = document.getElementById("related-articles-panel");
const relatedArticlesBody = document.getElementById("related-articles-body");
const relatedArticlesCount = document.getElementById("related-articles-count");
const docGapGuidance = document.getElementById("doc-gap-guidance");

const ticketReferenceEl = document.getElementById("ticket-reference");
const responseEl = document.getElementById("support-response");
const responseHint = document.getElementById("response-hint");
const copyResponseBtn = document.getElementById("copy-response-btn");
const copyResponseLabel = copyResponseBtn?.querySelector(".copy-label");

const kbPlaceholder = document.getElementById("kb-placeholder");
const kbContent = document.getElementById("kb-article-content");
const kbTitle = document.getElementById("kb-title");
const kbCategory = document.getElementById("kb-category");
const kbSummary = document.getElementById("kb-summary");
const kbStepsList = document.getElementById("kb-steps-list");
const kbStepsLabel = document.getElementById("kb-steps-label");
const kbStepsEmpty = document.getElementById("kb-steps-empty");
const kbAddStepBtn = document.getElementById("kb-add-step-btn");
const kbTags = document.getElementById("kb-tags");
const kbFormFields = [kbTitle, kbCategory, kbSummary, kbTags];
const kbError = document.getElementById("kb-error");
const kbGenStatus = document.getElementById("kb-gen-status");
const kbActions = document.getElementById("kb-actions");
const kbPublishError = document.getElementById("kb-publish-error");
const kbRetryBtn = document.getElementById("kb-retry-btn");

const previewBadge = document.getElementById("preview-badge");
const projectPreviewMeta = document.getElementById("project-preview-meta");
const ticketSampleActions = document.getElementById("ticket-sample-actions");
const loadSampleTicketMatchBtn = document.getElementById("load-sample-ticket-match-btn");
const loadSampleTicketGapBtn = document.getElementById("load-sample-ticket-gap-btn");

const notionModalBackdrop = document.getElementById("notion-publish-modal-backdrop");
const notionModalClose = document.getElementById("notion-publish-modal-close");
const notionModalTitle = document.getElementById("notion-publish-modal-title");
const notionModalLink = document.getElementById("notion-publish-modal-link");
const notionModalCopy = document.getElementById("notion-publish-modal-copy");
const notionModalHint = document.getElementById("notion-publish-modal-hint");

let analysisState = null;
let currentKbArticle = null;
let maxReachedStep = FLOW_STEP.PASTE;
let kbPublished = false;
let kbPublishing = false;
let validationTimeout = null;
let suppressTicketReset = false;

// --- Accessibility ---

function announce(message) {
  if (!srAnnouncer || !message) return;
  srAnnouncer.textContent = "";
  requestAnimationFrame(() => {
    srAnnouncer.textContent = message;
  });
}

// --- Step navigation ---

function getVisibleFlowStep() {
  if (!step4View.classList.contains("hidden")) return FLOW_STEP.KB;
  if (!step3View.classList.contains("hidden")) return FLOW_STEP.RESPONSE;
  if (!step2View.classList.contains("hidden")) return FLOW_STEP.MATCH;
  return FLOW_STEP.PASTE;
}

function showStepView(step) {
  step1View.classList.toggle("hidden", step !== FLOW_STEP.PASTE);
  step2View.classList.toggle("hidden", step !== FLOW_STEP.MATCH);
  step3View.classList.toggle("hidden", step !== FLOW_STEP.RESPONSE);
  step4View.classList.toggle("hidden", step !== FLOW_STEP.KB);
}

function canNavigateToStep(step) {
  if (step < FLOW_STEP.PASTE || step > FLOW_STEP.KB) return false;
  if (step > maxReachedStep) return false;
  if (step >= FLOW_STEP.MATCH && !analysisState) return false;
  return true;
}

function updateSidebarSteps(activeStep) {
  stepItems.forEach((item) => {
    const step = Number(item.dataset.step);
    const link = item.querySelector(".step-link");
    const isActive = step === activeStep;
    const isLocked = step > maxReachedStep;
    const isCompleted = step < activeStep || (kbPublished && step <= FLOW_STEP.KB);
    const isClickable = isActive || isCompleted;

    item.classList.remove("active", "completed", "locked", "reachable", "upcoming");
    if (isActive) item.classList.add("active");
    if (isCompleted) item.classList.add("completed");
    if (isLocked) item.classList.add("locked");
    else if (!isClickable) item.classList.add("upcoming");
    else item.classList.add("reachable");

    if (link) {
      link.disabled = !isClickable;
      link.setAttribute("aria-current", isActive ? "step" : "false");
    }
  });
}

function setFlowStep(activeStep) {
  maxReachedStep = Math.max(maxReachedStep, activeStep);
  updateSidebarSteps(activeStep);
  updateFooterNavigation();
}

function goToStep(targetStep, options = {}) {
  if (targetStep >= FLOW_STEP.RESPONSE) syncTicketReference();
  showStepView(targetStep);
  setFlowStep(targetStep);
  updateCopyResponseVisibility();
  updateKbActionsVisibility();
  updateKeyboardHintVisibility();

  workflowFooter?.classList.toggle(
    "workflow-footer--step-first",
    targetStep === FLOW_STEP.PASTE
  );

  if (options.focus) {
    if (targetStep === FLOW_STEP.PASTE) ticketEl?.focus();
    else if (targetStep === FLOW_STEP.MATCH) docsPanel?.focus();
    else if (targetStep === FLOW_STEP.RESPONSE) responseEl?.focus();
    else if (targetStep === FLOW_STEP.KB) kbTitle?.focus();
  }
}

function navigateToStep(targetStep, options = {}) {
  if (!canNavigateToStep(targetStep)) return false;
  goToStep(targetStep, options);
  return true;
}

function markAllStepsCompleted() {
  stepItems.forEach((item) => {
    item.classList.remove("active", "locked");
    item.classList.add("completed", "reachable");
    const link = item.querySelector(".step-link");
    if (link) {
      link.disabled = false;
      link.setAttribute("aria-current", "false");
    }
  });
}

function updateFooterNavigation() {
  const step = getVisibleFlowStep();
  const onKbStep = step === FLOW_STEP.KB;

  footerStepCounter.textContent = `Step ${step} of 4`;

  workflowFooter?.classList.toggle("workflow-footer--step-kb", onKbStep);

  if (step === FLOW_STEP.PASTE) {
    footerBackBtn.hidden = true;
    footerBackBtn.disabled = true;
  } else {
    footerBackBtn.hidden = false;
    footerBackBtn.disabled = false;
    footerBackBtn.setAttribute(
      "aria-label",
      onKbStep ? "Go back to write response" : `Go back to step ${step - 1}`
    );
  }

  const showKbDownload = onKbStep && Boolean(currentKbArticle);
  kbDownloadBtn?.classList.toggle("hidden", !showKbDownload);
  if (kbDownloadBtn) {
    kbDownloadBtn.disabled = !currentKbArticle || kbPublished;
  }

  footerNextBtn.classList.remove("published", "is-muted", "workflow-footer__next--publish", "loading");
  footerNextBtn.removeAttribute("aria-busy");

  if (onKbStep) {
    footerNextBtn.classList.add("workflow-footer__next--publish");
    if (kbPublishing) {
      footerNextLabel.textContent = IS_DEMO_MODE ? "Previewing…" : "Publishing";
      footerNextBtn.classList.add("loading");
      footerNextBtn.setAttribute("aria-busy", "true");
    } else if (kbPublished) {
      footerNextLabel.textContent = IS_DEMO_MODE ? "Preview complete" : "Published";
    } else {
      footerNextLabel.textContent = IS_DEMO_MODE
        ? "Preview publish"
        : FOOTER_NEXT_LABELS[FLOW_STEP.KB];
    }
    footerNextBtn.setAttribute(
      "aria-label",
      kbPublishing
        ? IS_DEMO_MODE
          ? "Running publish preview"
          : "Publishing to Notion"
        : kbPublished
          ? IS_DEMO_MODE
            ? "Publish preview complete"
            : "Article published to Notion"
          : IS_DEMO_MODE
            ? "Preview publishing to Notion"
            : FOOTER_NEXT_ARIA_LABELS[FLOW_STEP.KB]
    );
    footerNextBtn.disabled = !currentKbArticle || kbPublished || kbPublishing;
    if (kbPublished) footerNextBtn.classList.add("published");
    return;
  }

  footerNextLabel.textContent = FOOTER_NEXT_LABELS[step];
  footerNextBtn.setAttribute("aria-label", FOOTER_NEXT_ARIA_LABELS[step]);

  let canProceed = false;
  if (step === FLOW_STEP.PASTE) {
    canProceed = ticketEl.value.trim().length > 0;
  } else if (step === FLOW_STEP.MATCH) {
    canProceed = Boolean(analysisState);
  } else if (step === FLOW_STEP.RESPONSE) {
    canProceed = responseEl.value.trim().length > 0;
  }

  footerNextBtn.disabled = !canProceed || footerNextBtn.classList.contains("loading");
  footerNextBtn.classList.toggle("is-muted", !canProceed);
}

function canFooterNext() {
  return !footerNextBtn.disabled && !footerNextBtn.classList.contains("loading");
}

function handleFooterBack() {
  const step = getVisibleFlowStep();
  if (step > FLOW_STEP.PASTE) {
    navigateToStep(step - 1, {
      focus: step - 1 === FLOW_STEP.PASTE || step - 1 === FLOW_STEP.RESPONSE
    });
  }
}

function handleFooterNext() {
  const step = getVisibleFlowStep();

  if (step === FLOW_STEP.PASTE) {
    runAnalysis();
  } else if (step === FLOW_STEP.MATCH) {
    hideDocGapGuidance();
    goToStep(FLOW_STEP.RESPONSE, { focus: true });
    updateCopyResponseVisibility();
  } else if (step === FLOW_STEP.RESPONSE) {
    if (maxReachedStep >= FLOW_STEP.KB && currentKbArticle) {
      goToStep(FLOW_STEP.KB);
    } else {
      generateKbArticle();
    }
  } else if (step === FLOW_STEP.KB && currentKbArticle && !kbPublished && !kbPublishing) {
    publishKbArticle();
  }
}

function tryFooterNext() {
  if (getVisibleFlowStep() === FLOW_STEP.PASTE) {
    runAnalysis();
    return;
  }
  if (!canFooterNext()) return;
  handleFooterNext();
}

function handleSidebarNav(event) {
  const btn = event.target.closest("[data-step-nav]");
  if (!btn || btn.disabled) return;

  const targetStep = Number(btn.dataset.stepNav);
  if (targetStep === getVisibleFlowStep()) return;

  navigateToStep(targetStep, { focus: targetStep === FLOW_STEP.RESPONSE });
  if (isMobileViewport()) closeMobileSidebar();
}

// --- Analyse validation ---

function updateAnalyseState() {
  if (getVisibleFlowStep() !== FLOW_STEP.PASTE) return;
  if (ticketEl.value.trim().length > 0) hideAnalyseValidation();
  updateFooterNavigation();
}

function showAnalyseValidation() {
  analyseValidation.classList.remove("hidden");
  clearTimeout(validationTimeout);
  validationTimeout = setTimeout(hideAnalyseValidation, 4000);
}

function hideAnalyseValidation() {
  analyseValidation.classList.add("hidden");
}

// --- Documentation matching ---

/** Generic support language — excluded from ticket tokens and article keywords when scoring. */
const STOPWORDS = new Set([
  "admin",
  "account",
  "settings",
  "user",
  "users",
  "platform",
  "access",
  "issue",
  "problem",
  "error",
  "help",
  "support",
  "team",
  "request",
  "please",
  "trying",
  "unable",
  "getting",
  "found",
  "using",
  "hello",
  "hi",
  "thanks",
  "thank",
  "regards",
  "dear",
  "login",
  "log",
  "page",
  "click",
  "button",
  "screen",
  "message",
  "system",
  "service",
  "contact",
  "following",
  "below",
  "above",
  "steps",
  "step",
  "navigate",
  "check"
]);

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ticketWordsFromText(ticketText) {
  return ticketText
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

function keywordMatchesTicket(keyword, ticketLower, ticketWords) {
  const lower = keyword.toLowerCase().trim();
  if (!lower || STOPWORDS.has(lower)) return false;

  if (lower.includes(" ")) {
    const pattern = lower
      .split(/\s+/)
      .map((part) => escapeRegExp(part))
      .join("\\s+");
    return new RegExp(`(?:^|[^a-z0-9])${pattern}(?:[^a-z0-9]|$)`, "i").test(ticketLower);
  }

  if (lower.length <= 3) {
    return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(lower)}(?:[^a-z0-9]|$)`, "i").test(
      ticketLower
    );
  }

  return ticketWords.includes(lower);
}

function scoreKeywords(ticketText, articleKeywords) {
  const ticketLower = ticketText.toLowerCase();
  const ticketWords = ticketWordsFromText(ticketText);

  const domainKeywords = articleKeywords.filter((k) => {
    const lower = k.toLowerCase().trim();
    return lower && !STOPWORDS.has(lower);
  });

  if (domainKeywords.length === 0) {
    return { relevance: 0, matched: [], matchCount: 0 };
  }

  const matched = domainKeywords.filter((k) =>
    keywordMatchesTicket(k, ticketLower, ticketWords)
  );

  const relevance = Math.round((matched.length / domainKeywords.length) * 100);
  return { relevance, matched, matchCount: matched.length };
}

function scoreDocument(doc, ticketText) {
  const { relevance, matched, matchCount } = scoreKeywords(ticketText, doc.keywords);
  return { score: matchCount, matched, relevance };
}

function buildSuggestedResponse(doc) {
  const steps = doc.resolutionSteps
    .map((step, i) => `${i + 1}. ${step}`)
    .join("\n");

  return `Hi,

Thank you for reaching out. I understand you're having trouble with ${doc.issueTopic}, and I'm here to help.

Here are the steps that should resolve this:

${steps}

You can find our full guide on this here: ${doc.title} (/kb/${doc.id})

If you still need help after trying these steps, reply to this thread and we'll investigate further.

Best regards,
Support`;
}

function findBestMatch(ticketText) {
  const ranked = DOCUMENTATION.map((doc) => {
    const { score, matched, relevance } = scoreDocument(doc, ticketText);
    return { ...doc, score, matched, relevance };
  }).sort((a, b) => {
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    return b.score - a.score;
  });

  const nearMisses = ranked.filter(
    (d) => d.relevance >= CONFIG.nearMissMin && d.relevance < CONFIG.strongMatchThreshold
  );

  const best = ranked[0];
  if (!best || best.relevance < CONFIG.strongMatchThreshold) {
    return {
      strong: false,
      best: best || null,
      ranked: ranked.filter((d) => d.relevance > 0).slice(0, 3),
      nearMisses
    };
  }
  return { strong: true, best, ranked: ranked.slice(0, 3), nearMisses: [] };
}

// --- UI helpers ---

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function setButtonLoading(btn, loading) {
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle("loading", loading);
  btn.setAttribute("aria-busy", loading ? "true" : "false");
}

function syncTicketReference() {
  ticketReferenceEl.value = ticketEl.value;
}

function formatRelatedArticlesCount(count) {
  if (count > 1) return `${count} articles`;
  return "";
}

function hideRelatedArticlesPanel() {
  relatedArticlesPanel?.classList.add("hidden");
  if (relatedArticlesBody) relatedArticlesBody.innerHTML = "";
  relatedArticlesCount?.classList.add("hidden");
  if (relatedArticlesCount) relatedArticlesCount.textContent = "";
}

function renderDocResolutionStepsHtml(doc) {
  const steps = Array.isArray(doc.resolutionSteps) ? doc.resolutionSteps : [];
  if (!steps.length) {
    return `<p class="near-miss-steps-empty">No detailed steps in catalogue.</p>`;
  }

  const stepCountLabel = steps.length === 1 ? "1 step" : `${steps.length} steps`;
  const listItems = steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("");

  return `
    <details class="near-miss-steps">
      <summary class="near-miss-steps-summary">
        <span>View troubleshooting steps</span>
        <span class="near-miss-steps-count" aria-hidden="true">${stepCountLabel}</span>
      </summary>
      <ol class="near-miss-steps-list">${listItems}</ol>
    </details>
  `;
}

function renderRelatedArticlesPanel(nearMisses = []) {
  if (!nearMisses.length) {
    hideRelatedArticlesPanel();
    return;
  }

  relatedArticlesPanel?.classList.remove("hidden");

  const countLabel = formatRelatedArticlesCount(nearMisses.length);
  if (relatedArticlesCount) {
    if (countLabel) {
      relatedArticlesCount.textContent = countLabel;
      relatedArticlesCount.classList.remove("hidden");
    } else {
      relatedArticlesCount.textContent = "";
      relatedArticlesCount.classList.add("hidden");
    }
  }

  relatedArticlesBody.innerHTML = nearMisses
    .map(
      (doc) => `
        <article class="near-miss-item panel-inset-card">
          <p class="near-miss-title">${escapeHtml(doc.title)}</p>
          <p class="near-miss-meta">${escapeHtml(doc.category)} · ${doc.relevance}% relevance</p>
          <p class="near-miss-snippet">${escapeHtml(doc.snippet)}</p>
          ${renderDocResolutionStepsHtml(doc)}
        </article>
      `
    )
    .join("");
}

function showDocGapGuidance() {
  docGapGuidance?.classList.remove("hidden");
}

function hideDocGapGuidance() {
  docGapGuidance?.classList.add("hidden");
}

function setDocsPanelTitle(state) {
  if (docsPanelTitle) {
    docsPanelTitle.textContent = DOCS_PANEL_TITLE[state] ?? DOCS_PANEL_TITLE.scanning;
  }
}

function setDocsPanelScanning() {
  setDocsPanelTitle("scanning");
  if (docsStatus) {
    docsStatus.textContent = "Scanning";
    docsStatus.className = "status-badge idle";
  }
  if (docsBody) docsBody.innerHTML = "";
}

function renderStrongMatch(match) {
  setDocsPanelTitle("match");
  docsStatus.textContent = `${match.relevance}% match`;
  docsStatus.className = "status-badge match";
  docsBody.innerHTML = `
    <div class="alert match">
      <p class="doc-match-title">${escapeHtml(match.title)}</p>
      <p class="doc-match-meta">${escapeHtml(match.category)} · Documentation found</p>
      <p class="alert-snippet">${escapeHtml(match.snippet)}</p>
      <span class="relevance">Relevance · ${match.relevance}% · Keywords: ${escapeHtml(match.matched.slice(0, 5).join(", ") || "—")}</span>
    </div>
    <p class="panel-note">
      A suggested response will be ready when you continue. Replace the placeholder link (/kb/${escapeHtml(match.id)}) with your live URL before sending.
    </p>
    <p class="panel-note">${escapeHtml(MATCH_THRESHOLD_NOTE)}</p>
  `;
  hideRelatedArticlesPanel();
  hideDocGapGuidance();
}

function renderDocumentationGap(nearMisses = []) {
  setDocsPanelTitle("gap");
  docsStatus.textContent = "Documentation gap";
  docsStatus.className = "status-badge gap";
  docsBody.innerHTML = `
    <p class="panel-match-threshold panel-inset-card" role="status">${escapeHtml(MATCH_THRESHOLD_NOTE)}</p>
  `;
  renderRelatedArticlesPanel(nearMisses);
  showDocGapGuidance();
}

function updateCopyResponseVisibility() {
  const onResponseStep = getVisibleFlowStep() === FLOW_STEP.RESPONSE;
  const hasResponse = responseEl.value.trim().length > 0;
  copyResponseBtn?.classList.toggle("hidden", !onResponseStep || !hasResponse);
}

// --- KB article ---

function setKbFieldsEditable(editable) {
  kbFormFields.forEach((field) => {
    if (field) field.disabled = !editable;
  });
  kbStepsList?.querySelectorAll(".kb-step-input").forEach((field) => {
    field.disabled = !editable;
  });
  if (kbDownloadBtn) kbDownloadBtn.disabled = !editable;
}

function resetKbPublishUi() {
  kbPublishing = false;
  kbPublishError?.classList.add("hidden");
  closeNotionPublishModal();
}

function setKbPublishLoading(loading) {
  kbPublishing = loading;
  setButtonLoading(footerNextBtn, loading);
  updateFooterNavigation();
}

function showKbPublishError(message) {
  if (kbPublishError) {
    kbPublishError.textContent = message || "Publishing failed, please try again";
    kbPublishError.classList.remove("hidden");
  }
}

function isNotionModalOpen() {
  return (
    notionModalBackdrop && !notionModalBackdrop.classList.contains("hidden")
  );
}

function openNotionPublishModal(notionUrl, options = {}) {
  const { demo = false } = options;
  const url = notionUrl || CONFIG.notionFallbackUrl;
  const isPublicSite = /\.notion\.site\//i.test(url);

  if (notionModalTitle) {
    notionModalTitle.textContent = demo
      ? "Publish preview complete"
      : "Published to Notion";
  }

  if (notionModalLink) {
    notionModalLink.href = url;
    notionModalLink.textContent = demo
      ? "Learn about Notion integrations"
      : isPublicSite
        ? "View published page"
        : "View in Notion";
  }

  if (notionModalHint) {
    notionModalHint.textContent = demo
      ? "Preview only on this hosted version. A live deployment publishes to your Notion workspace."
      : "This dialog only blocks the dashboard until you close it (Esc or ×). If Notion is slow, close extra Notion tabs first.";
  }

  notionModalBackdrop?.classList.remove("hidden");
  notionModalBackdrop?.setAttribute("aria-hidden", "false");
  document.body.classList.add("notion-modal-open");
  notionModalClose?.focus();
}

async function copyNotionPageLink() {
  const url = notionModalLink?.href;
  if (!url || url === "#") return;

  try {
    await navigator.clipboard.writeText(url);
    announce("Notion page link copied.");
  } catch {
    announce("Could not copy link.");
  }
}

function closeNotionPublishModal() {
  notionModalBackdrop?.classList.add("hidden");
  notionModalBackdrop?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("notion-modal-open");
}

function saveDraft() {
  try {
    sessionStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        ticket: ticketEl.value,
        response: responseEl.value,
        step: getVisibleFlowStep(),
        maxReachedStep
      })
    );
  } catch {
    // sessionStorage may be unavailable
  }
}

function loadDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return false;
    const draft = JSON.parse(raw);
    if (!draft.ticket && !draft.response) return false;

    const restore = window.confirm("Restore your previous draft?");
    if (!restore) {
      sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      return false;
    }

    ticketEl.value = draft.ticket || "";
    responseEl.value = draft.response || "";
    maxReachedStep = draft.maxReachedStep || FLOW_STEP.PASTE;
    updateAnalyseState();
    syncSampleButtonStateFromTicket();
    goToStep(draft.step || FLOW_STEP.PASTE);
    return true;
  } catch {
    return false;
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // sessionStorage may be unavailable
  }
}

let draftSaveTimeout = null;
function scheduleSaveDraft() {
  clearTimeout(draftSaveTimeout);
  draftSaveTimeout = setTimeout(saveDraft, 400);
}

function updateKbActionsVisibility() {
  const hasArticle = Boolean(currentKbArticle);
  const hasError = kbError && !kbError.classList.contains("hidden");

  kbActions?.classList.toggle("hidden", !hasArticle && !hasError);
  kbRetryBtn?.classList.toggle("hidden", hasArticle && !hasError);
}

function resetKbArticleOnly() {
  currentKbArticle = null;
  kbPublished = false;
  resetKbPublishUi();
  kbPlaceholder?.classList.remove("hidden");
  if (kbPlaceholder) kbPlaceholder.textContent = "Generating your knowledge base article…";
  kbContent?.classList.add("hidden");
  kbError?.classList.add("hidden");
  if (kbTitle) kbTitle.value = "";
  if (kbCategory) kbCategory.value = "";
  if (kbSummary) kbSummary.value = "";
  if (kbTags) kbTags.value = "";
  if (kbStepsList) kbStepsList.replaceChildren();
  updateKbStepsUi();
  kbGenStatus.textContent = "Draft";
  kbGenStatus.className = "status-badge idle";
  setKbFieldsEditable(true);
  updateKbActionsVisibility();
  updateFooterNavigation();
}

function createKbStepRow(stepText, index) {
  const row = document.createElement("div");
  row.className = "kb-step-row";
  row.setAttribute("role", "listitem");

  const num = document.createElement("span");
  num.className = "kb-step-row__num";
  num.textContent = `${index + 1}.`;
  num.setAttribute("aria-hidden", "true");

  const input = document.createElement("textarea");
  input.className = "kb-input kb-textarea kb-step-input";
  input.rows = 2;
  input.value = stepText;
  input.placeholder = "Describe what the customer should do…";
  input.setAttribute("aria-label", `Troubleshooting step ${index + 1}`);
  input.spellcheck = true;

  row.append(num, input);
  return row;
}

function renumberKbSteps() {
  if (!kbStepsList) return;
  kbStepsList.querySelectorAll(".kb-step-row").forEach((row, index) => {
    const num = row.querySelector(".kb-step-row__num");
    const input = row.querySelector(".kb-step-input");
    if (num) num.textContent = `${index + 1}.`;
    if (input) input.setAttribute("aria-label", `Troubleshooting step ${index + 1}`);
  });
}

function updateKbStepsUi() {
  const count = kbStepsList?.querySelectorAll(".kb-step-input").length ?? 0;
  kbStepsEmpty?.classList.toggle("hidden", count > 0);
  if (kbStepsLabel) {
    kbStepsLabel.textContent = count
      ? `Troubleshooting steps (${count})`
      : "Troubleshooting steps";
  }
  if (kbAddStepBtn) kbAddStepBtn.disabled = kbPublished;
}

function addKbStepRow(stepText = "") {
  if (!kbStepsList || kbPublished) return;
  const index = kbStepsList.querySelectorAll(".kb-step-row").length;
  kbStepsList.appendChild(createKbStepRow(stepText, index));
  renumberKbSteps();
  updateKbStepsUi();
  const input = kbStepsList.querySelectorAll(".kb-step-input")[index];
  input?.focus();
}

function renderKbSteps(steps) {
  if (!kbStepsList) return;
  kbStepsList.replaceChildren(...steps.map((step, index) => createKbStepRow(step, index)));
  updateKbStepsUi();
}

function syncKbArticleFromForm() {
  if (!currentKbArticle) return null;

  const steps = kbStepsList
    ? [...kbStepsList.querySelectorAll(".kb-step-input")].map((el) => el.value.trim()).filter(Boolean)
    : [];

  const tags = kbTags.value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  currentKbArticle = {
    title: kbTitle.value.trim(),
    summary: kbSummary.value.trim(),
    category: kbCategory.value.trim() || "General",
    steps,
    tags
  };

  return currentKbArticle;
}

function validateKbArticle(article) {
  if (!article.title) return "Add a title before publishing.";
  if (!article.summary) return "Add a summary before publishing.";
  if (!article.steps.length) return "Add at least one troubleshooting step before publishing.";
  return null;
}

function buildKbMarkdown(article) {
  return `# ${article.title}

**Category:** ${article.category}
**Tags:** ${article.tags.join(", ")}

## Summary

${article.summary}

## Troubleshooting steps

${article.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}
`;
}

function buildNotionPageChildren(article) {
  const blocks = [];

  if (article.summary) {
    blocks.push(
      {
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: [{ type: "text", text: { content: "Summary" } }] }
      },
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: String(article.summary).slice(0, 2000) } }]
        }
      }
    );
  }

  if (article.steps?.length) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: { rich_text: [{ type: "text", text: { content: "Troubleshooting steps" } }] }
    });
    for (const step of article.steps) {
      blocks.push({
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{ type: "text", text: { content: String(step).slice(0, 2000) } }]
        }
      });
    }
  }

  return blocks;
}

function buildNotionPublishPayload(article) {
  const children = buildNotionPageChildren(article);
  return {
    title: article.title,
    summary: article.summary,
    category: article.category,
    tags: article.tags,
    steps: article.steps,
    markdown: buildKbMarkdown(article),
    children
  };
}

function slugifyFilename(title) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "kb-article";
}

function downloadKbMarkdownFile(article) {
  const markdown = buildKbMarkdown(article);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugifyFilename(article.title)}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function handleKbFormInput() {
  if (!currentKbArticle || kbPublished) return;
  syncKbArticleFromForm();
}

function downloadKbArticle() {
  if (!currentKbArticle) return;

  const article = syncKbArticleFromForm();
  if (!article.title && !article.summary && !article.steps.length) return;

  downloadKbMarkdownFile(article);
  announce("Markdown file downloaded.");
}

function renderKbArticle(article) {
  currentKbArticle = { ...article };
  kbPlaceholder?.classList.add("hidden");
  kbContent?.classList.remove("hidden");
  kbError?.classList.add("hidden");

  kbTitle.value = article.title;
  kbCategory.value = article.category;
  kbSummary.value = article.summary;
  kbTags.value = article.tags.join(", ");
  renderKbSteps(article.steps);

  setKbFieldsEditable(true);
  kbGenStatus.textContent = "Ready for review";
  kbGenStatus.className = "status-badge match";
  updateKbActionsVisibility();
  updateFooterNavigation();
  announce("Knowledge base article ready for review.");
}

function resetAfterTicketChange() {
  const preservedTicket = ticketEl.value;
  clearDraft();
  analysisState = null;
  currentKbArticle = null;
  maxReachedStep = FLOW_STEP.PASTE;
  kbPublished = false;
  responseEl.value = "";
  responseHint.textContent = "";
  hideRelatedArticlesPanel();
  hideDocGapGuidance();
  if (docsBody) docsBody.innerHTML = "";
  resetKbArticleOnly();
  ticketEl.value = preservedTicket;
  goToStep(FLOW_STEP.PASTE);
  updateAnalyseState();
  syncSampleButtonStateFromTicket();
  announce("Ticket changed — workflow reset.");
}

function handleTicketInput() {
  updateAnalyseState();
  if (!analysisState || suppressTicketReset) return;

  const confirmed = window.confirm(
    "Changing the ticket will reset your analysis, response, and KB draft. Continue?"
  );

  if (!confirmed) {
    suppressTicketReset = true;
    ticketEl.value = analysisState.ticket;
    suppressTicketReset = false;
    return;
  }

  resetAfterTicketChange();
}

// --- Analysis flow ---

async function runAnalysis() {
  const ticket = ticketEl.value.trim();
  if (!ticket) {
    showAnalyseValidation();
    ticketEl.focus();
    return;
  }

  hideAnalyseValidation();
  setButtonLoading(footerNextBtn, true);
  resetKbArticleOnly();
  responseEl.value = "";
  responseHint.textContent = "";
  hideRelatedArticlesPanel();
  hideDocGapGuidance();
  setDocsPanelScanning();

  await new Promise((r) => setTimeout(r, CONFIG.analysisDelayMs));

  const result = findBestMatch(ticket);
  analysisState = { ticket, ...result };

  if (result.strong) {
    renderStrongMatch(result.best);
    responseEl.value = buildSuggestedResponse(result.best);
    responseHint.textContent =
      "— suggested from documentation; personalise and update the /kb/ link before sending";
    announce(`Documentation match found at ${result.best.relevance}% relevance.`);
  } else {
    renderDocumentationGap(result.nearMisses);
    responseHint.textContent = "— write your response to the client";
    announce("Documentation gap identified. Related articles shown for reference.");
  }

  setButtonLoading(footerNextBtn, false);
  goToStep(FLOW_STEP.MATCH, { focus: true });
  scheduleSaveDraft();
}

async function copySupportResponse() {
  const text = responseEl.value.trim();
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    copyResponseBtn?.classList.add("copied");
    if (copyResponseLabel) copyResponseLabel.textContent = "Copied";
    announce("Support response copied to clipboard.");
    setTimeout(() => {
      copyResponseBtn?.classList.remove("copied");
      if (copyResponseLabel) copyResponseLabel.textContent = "Copy";
    }, 2000);
  } catch {
    if (copyResponseLabel) copyResponseLabel.textContent = "Failed";
    announce("Could not copy response to clipboard.");
    setTimeout(() => {
      if (copyResponseLabel) copyResponseLabel.textContent = "Copy";
    }, 2000);
  }
}

// --- Claude API ---

async function callClaude(userPrompt, maxTokens = 2048) {
  const res = await fetch(CONFIG.proxyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CONFIG.claudeModel,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: userPrompt }]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Proxy request failed (${res.status})`);
  }

  const data = await res.json();
  if (data.type === "error") {
    throw new Error(data.error?.message || "API error");
  }

  const textBlock = data.content?.find((b) => b.type === "text");
  if (!textBlock?.text) {
    throw new Error("Unexpected response from proxy.");
  }
  return textBlock.text.trim();
}

function buildDemoKbArticle(ticket, response) {
  const lines = ticket.split(/\n/).map((line) => line.trim()).filter(Boolean);
  let title = lines[0] || "Knowledge base article";
  title = title.replace(/^re:\s*/i, "").trim();
  if (title.length > 80) title = `${title.slice(0, 77)}…`;

  const topic =
    analysisState?.strong && analysisState.best
      ? analysisState.best.issueTopic || analysisState.best.title
      : "this issue";
  const category =
    analysisState?.strong && analysisState.best ? analysisState.best.category : "General";

  const stepsFromResponse = response
    .split(/\n/)
    .map((line) => line.replace(/^\d+[\.\)]\s*/, "").trim())
    .filter((line) => line.length > 24);

  const steps =
    stepsFromResponse.length >= 2
      ? stepsFromResponse.slice(0, 7)
      : [
          "Review the support response and confirm each step applies to your environment.",
          "Apply the recommended configuration or workaround from the agent's reply.",
          "Test the workflow again to confirm the issue is resolved.",
          "If the problem continues, reply with any error messages and timestamps for further help."
        ];

  return {
    title,
    summary: `This draft summarises how to address ${topic} based on the ticket and support response. Review and edit before publishing to your knowledge base.`,
    steps,
    category,
    tags: ["support-workflow", "kb-draft"]
  };
}

function parseKbJson(raw) {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned);

  if (!parsed.title || !parsed.summary || !Array.isArray(parsed.steps)) {
    throw new Error("Invalid KB article structure.");
  }

  return {
    title: String(parsed.title),
    summary: String(parsed.summary),
    steps: parsed.steps.map(String),
    category: String(parsed.category || "General"),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : []
  };
}

async function generateKbArticle() {
  const ticket = ticketEl.value.trim();
  const response = responseEl.value.trim();
  if (!ticket || !response) return;

  goToStep(FLOW_STEP.KB);
  resetKbArticleOnly();
  setButtonLoading(footerNextBtn, true);
  kbError?.classList.add("hidden");
  kbGenStatus.textContent = "Generating…";
  kbGenStatus.className = "status-badge idle";
  kbActions?.classList.remove("hidden");
  kbRetryBtn?.classList.remove("hidden");

  const prompt = `You are a senior technical support writer. Create a customer-facing knowledge base article from this resolved support ticket.

Return ONLY valid JSON (no markdown fences, no commentary) with this exact structure:
{
  "title": "clear article title",
  "summary": "2-3 sentence overview for customers",
  "steps": ["step 1", "step 2", "..."],
  "category": "one category name",
  "tags": ["tag1", "tag2", "tag3"]
}

Requirements:
- steps must be numbered troubleshooting/resolution steps a customer can follow (4-8 steps)
- tone: professional, clear, empathetic
- do not include internal ticket IDs or agent names
- base content on the ticket issue and the support agent's confirmed response

INCOMING TICKET:
${ticket}

SUPPORT AGENT RESPONSE (confirmed resolution):
${response}`;

  try {
    if (IS_DEMO_MODE) {
      await new Promise((r) => setTimeout(r, CONFIG.demoGenerationDelayMs));
      renderKbArticle(buildDemoKbArticle(ticket, response));
    } else {
      const raw = await callClaude(prompt);
      renderKbArticle(parseKbJson(raw));
    }
  } catch (err) {
    kbError.textContent = err.message || "Failed to generate KB article. Please try again.";
    kbError.classList.remove("hidden");
    kbGenStatus.textContent = "Error";
    kbGenStatus.className = "status-badge gap";
    updateKbActionsVisibility();
    announce("KB article generation failed.");
  } finally {
    setButtonLoading(footerNextBtn, false);
    updateFooterNavigation();
  }
}

function extractNotionUrl(data) {
  if (!data || typeof data !== "object") return null;
  // Prefer public Notion Site URL — loads faster than the full notion.so workspace app.
  return (
    data.public_url ||
    data.publicUrl ||
    data.url ||
    data.page_url ||
    data.pageUrl ||
    data.notion_url ||
    data.notionUrl ||
    null
  );
}

async function publishToNotion(article) {
  const payload = buildNotionPublishPayload(article);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  let res;
  try {
    res = await fetch(CONFIG.notionPublishUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("Publish timed out. Close extra Notion tabs and try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const rawText = await res.text();
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new Error(data?.message || rawText || `Publish failed (${res.status})`);
  }

  if (data?.object === "error" || data?.type === "error") {
    throw new Error(data.message || "Notion publish failed.");
  }

  const notionUrl = extractNotionUrl(data);
  if (!notionUrl) {
    throw new Error("Publish did not return a Notion page URL.");
  }

  return data;
}

async function publishKbArticle() {
  if (!currentKbArticle || kbPublished || kbPublishing) return;

  const article = syncKbArticleFromForm();
  const validationError = validateKbArticle(article);
  if (validationError) {
    kbError.textContent = validationError;
    kbError.classList.remove("hidden");
    announce(validationError);
    return;
  }

  kbError?.classList.add("hidden");
  kbPublishError?.classList.add("hidden");
  setKbPublishLoading(true);

  try {
    if (IS_DEMO_MODE) {
      await new Promise((r) => setTimeout(r, CONFIG.demoPublishDelayMs));
      kbPublished = true;
      kbGenStatus.textContent = "Preview complete";
      kbGenStatus.className = "status-badge match";
      setKbFieldsEditable(false);
      markAllStepsCompleted();
      openNotionPublishModal(CONFIG.demoNotionPreviewUrl, { demo: true });
      announce("Publish preview complete.");
    } else {
      const data = await publishToNotion(article);
      const notionUrl = extractNotionUrl(data);

      kbPublished = true;
      kbGenStatus.textContent = "Published to Notion";
      kbGenStatus.className = "status-badge match";
      setKbFieldsEditable(false);
      markAllStepsCompleted();
      openNotionPublishModal(notionUrl);
      announce("Published to Notion successfully.");
    }
  } catch (err) {
    showKbPublishError(err?.message || "Publishing failed, please try again.");
    announce(err?.message || "Publishing failed, please try again.");
  } finally {
    kbPublishing = false;
    if (!kbPublished) {
      setKbPublishLoading(false);
    } else if (footerNextBtn) {
      footerNextBtn.classList.remove("loading");
      footerNextBtn.setAttribute("aria-busy", "false");
    }
    updateFooterNavigation();
  }
}

// --- Sidebar & mobile nav ---

function isMobileViewport() {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

function setSidebarCollapsed(collapsed) {
  appLayout?.classList.toggle("sidebar-collapsed", collapsed);
  sidebarToggle?.setAttribute("aria-expanded", collapsed ? "false" : "true");
  sidebarToggle?.setAttribute(
    "aria-label",
    collapsed ? "Expand sidebar" : "Collapse sidebar"
  );
  if (!isMobileViewport()) {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }
}

function toggleSidebar() {
  if (isMobileViewport()) {
    const open = appLayout?.classList.toggle("sidebar-open");
    sidebarBackdrop?.classList.toggle("hidden", !open);
    sidebarBackdrop?.setAttribute("aria-hidden", open ? "false" : "true");
    sidebarToggle?.setAttribute("aria-expanded", open ? "true" : "false");
    sidebarToggle?.setAttribute(
      "aria-label",
      open ? "Collapse sidebar" : "Expand sidebar"
    );
    return;
  }
  setSidebarCollapsed(!appLayout?.classList.contains("sidebar-collapsed"));
}

function closeMobileSidebar() {
  appLayout?.classList.remove("sidebar-open");
  sidebarBackdrop?.classList.add("hidden");
  sidebarBackdrop?.setAttribute("aria-hidden", "true");
  sidebarToggle?.setAttribute("aria-expanded", "false");
  sidebarToggle?.setAttribute("aria-label", "Expand sidebar");
}

function initSidebar() {
  if (isMobileViewport()) {
    setSidebarCollapsed(true);
  } else {
    try {
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") {
        setSidebarCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }

  sidebarToggle?.addEventListener("click", toggleSidebar);
}

function initMobileNav() {
  const syncMobileSidebar = () => {
    if (isMobileViewport()) {
      closeMobileSidebar();
      setSidebarCollapsed(true);
    } else {
      closeMobileSidebar();
      try {
        setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
      } catch {
        setSidebarCollapsed(false);
      }
    }
    updateKeyboardHintVisibility();
  };

  sidebarBackdrop?.addEventListener("click", closeMobileSidebar);
  window.addEventListener("resize", syncMobileSidebar);
  syncMobileSidebar();
}

// --- Keyboard ---

function isKeyboardHintDismissed() {
  try {
    return localStorage.getItem(KEYBOARD_HINT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function dismissKeyboardHint() {
  keyboardHint?.classList.add("hidden");
  try {
    localStorage.setItem(KEYBOARD_HINT_DISMISSED_KEY, "1");
  } catch {
    /* localStorage may be unavailable */
  }
}

function updateKeyboardHintVisibility() {
  if (!keyboardHint) return;
  const show = !isKeyboardHintDismissed();
  keyboardHint.classList.toggle("hidden", !show);
}

function initKeyboardHint() {
  updateKeyboardHintVisibility();
  keyboardHintClose?.addEventListener("click", dismissKeyboardHint);
}

function isEditableTextarea(target) {
  return (
    target instanceof HTMLTextAreaElement &&
    !target.readOnly &&
    !target.disabled
  );
}

function handleWorkflowKeyboard(event) {
  if (event.isComposing) return;

  if (event.key === "Escape" && isNotionModalOpen()) {
    event.preventDefault();
    closeNotionPublishModal();
    return;
  }

  const target = event.target;
  const modifierHeld = event.metaKey || event.ctrlKey;

  if (event.key === "ArrowLeft" && !modifierHeld) {
    if (isEditableTextarea(target) || target instanceof HTMLInputElement) return;
    event.preventDefault();
    handleFooterBack();
    return;
  }

  if (event.key === "ArrowRight" && !modifierHeld) {
    if (isEditableTextarea(target) || target instanceof HTMLInputElement) return;
    event.preventDefault();
    tryFooterNext();
    return;
  }

  if (event.key !== "Enter") return;

  if (isEditableTextarea(target)) {
    if (!modifierHeld) return;
    event.preventDefault();
    tryFooterNext();
    return;
  }

  if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) {
    return;
  }

  if (event.shiftKey) return;

  event.preventDefault();
  tryFooterNext();
}

// --- Event listeners ---

footerBackBtn?.addEventListener("click", handleFooterBack);
kbDownloadBtn?.addEventListener("click", downloadKbArticle);
footerNextBtn?.addEventListener("click", handleFooterNext);
stepList?.addEventListener("click", handleSidebarNav);

copyResponseBtn?.addEventListener("click", copySupportResponse);

kbRetryBtn?.addEventListener("click", () => {
  if (getVisibleFlowStep() === FLOW_STEP.KB) generateKbArticle();
});

kbContent?.addEventListener("input", handleKbFormInput);
kbAddStepBtn?.addEventListener("click", () => addKbStepRow());
kbStepsList?.addEventListener("input", () => {
  handleKbFormInput();
  updateKbStepsUi();
});

responseEl?.addEventListener("input", () => {
  updateFooterNavigation();
  updateCopyResponseVisibility();
  scheduleSaveDraft();
  if (currentKbArticle || getVisibleFlowStep() === FLOW_STEP.KB) {
    resetKbArticleOnly();
    if (analysisState) goToStep(FLOW_STEP.RESPONSE);
  }
});

ticketEl?.addEventListener("input", () => {
  handleTicketInput();
  syncSampleButtonStateFromTicket();
  scheduleSaveDraft();
});

notionModalClose?.addEventListener("click", closeNotionPublishModal);
notionModalCopy?.addEventListener("click", copyNotionPageLink);
notionModalBackdrop?.addEventListener("click", (e) => {
  if (e.target === notionModalBackdrop) closeNotionPublishModal();
});

document.addEventListener("keydown", handleWorkflowKeyboard);

function getActiveSampleFromTicket(ticketText) {
  const trimmed = ticketText.trim();
  if (trimmed === SAMPLE_TICKET_MATCH.trim()) return SAMPLE_KIND.MATCH;
  if (trimmed === SAMPLE_TICKET_GAP.trim()) return SAMPLE_KIND.GAP;
  return null;
}

function updateSampleButtonState(activeSample) {
  if (!IS_DEMO_MODE) return;
  const isMatch = activeSample === SAMPLE_KIND.MATCH;
  const isGap = activeSample === SAMPLE_KIND.GAP;
  loadSampleTicketMatchBtn?.classList.toggle("load-sample-ticket-btn--active", isMatch);
  loadSampleTicketGapBtn?.classList.toggle("load-sample-ticket-btn--active", isGap);
  loadSampleTicketMatchBtn?.setAttribute("aria-pressed", String(isMatch));
  loadSampleTicketGapBtn?.setAttribute("aria-pressed", String(isGap));
}

function syncSampleButtonStateFromTicket() {
  updateSampleButtonState(getActiveSampleFromTicket(ticketEl?.value ?? ""));
}

function loadSampleTicket(ticketText, announceMessage) {
  ticketEl.value = ticketText;
  handleTicketInput();
  syncSampleButtonStateFromTicket();
  scheduleSaveDraft();
  ticketEl.focus();
  announce(announceMessage);
}

function loadSampleTicketMatch() {
  loadSampleTicket(
    SAMPLE_TICKET_MATCH,
    "Strong-match sample loaded. Select Next to analyse against documentation."
  );
}

function loadSampleTicketGap() {
  loadSampleTicket(
    SAMPLE_TICKET_GAP,
    "Documentation-gap sample loaded. Select Next to analyse against documentation."
  );
}

function initPortfolioDemo() {
  if (!IS_DEMO_MODE) return;
  previewBadge?.classList.remove("hidden");
  projectPreviewMeta?.classList.remove("hidden");
  ticketSampleActions?.classList.remove("hidden");
  loadSampleTicketMatchBtn?.addEventListener("click", loadSampleTicketMatch);
  loadSampleTicketGapBtn?.addEventListener("click", loadSampleTicketGap);
  document.body.classList.add("portfolio-demo");
}

// --- Init ---

initPortfolioDemo();
initSidebar();
initMobileNav();
initKeyboardHint();
if (!loadDraft()) {
  goToStep(FLOW_STEP.PASTE);
}
updateAnalyseState();
