const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });

function corsHeaders(env, request) {
  const origin = request.headers.get("Origin") || "";
  const configured = String(env.ALLOWED_ORIGIN || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const defaults = [
    "https://readyforreal.life",
    "https://readyforreallife.github.io",
    "capacitor://localhost",
    "http://localhost",
    "https://localhost",
    "ionic://localhost",
  ];
  const allowedOrigins = new Set([...defaults, ...configured]);
  const allowed = allowedOrigins.has(origin)
    ? origin
    : configured[0] || defaults[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function normalizeAgreementNumber(value) {
  const trimmed = String(value || "")
    .trim()
    .toUpperCase();
  if (!trimmed) return "";
  if (trimmed.startsWith("MMMF-")) return trimmed;
  return "MMMF-" + trimmed.replace(/^MMMF-?/i, "");
}

function agreementNumberDigits(value) {
  const match = String(value || "").match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

function formatAgreementNumber(number) {
  return `MMMF-${String(number).padStart(4, "0")}`;
}

function nextAgreementNumber(entries) {
  const highest = entries.reduce(
    (max, entry) => Math.max(max, agreementNumberDigits(entry.agreementNumber)),
    0,
  );
  return formatAgreementNumber(Math.max(highest + 1, 1));
}

async function readRegistry(env) {
  const raw = await env.AGREEMENT_REGISTRY.get("entries");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRegistry(env, entries) {
  await env.AGREEMENT_REGISTRY.put("entries", JSON.stringify(entries, null, 2));
}

async function createSession(env) {
  const token = crypto.randomUUID();
  await env.AGREEMENT_REGISTRY.put(
    `session:${token}`,
    JSON.stringify({ issuedAt: new Date().toISOString() }),
    {
      expirationTtl: 60 * 60 * 6,
    },
  );
  return token;
}

async function requireSession(env, token) {
  const trimmed = String(token || "").trim();
  if (!trimmed) {
    throw new Error("Missing admin session.");
  }
  const session = await env.AGREEMENT_REGISTRY.get(`session:${trimmed}`);
  if (!session) {
    throw new Error("Your admin session expired. Sign in again.");
  }
  await env.AGREEMENT_REGISTRY.put(`session:${trimmed}`, session, {
    expirationTtl: 60 * 60 * 6,
  });
}

function buildRegistryResponse(entries) {
  return {
    ok: true,
    entries,
    next_number: nextAgreementNumber(entries),
    summary: {
      total_issued: entries.length,
      total_signed: entries.filter((entry) => entry.status === "Signed").length,
      total_pending: entries.filter(
        (entry) => entry.status === "Pending signature",
      ).length,
      highest_number: String(
        entries.reduce(
          (max, entry) =>
            Math.max(max, agreementNumberDigits(entry.agreementNumber)),
          0,
        ),
      ).padStart(4, "0"),
    },
  };
}

async function readRegistrations(env) {
  const raw = await env.AGREEMENT_REGISTRY.get("registrations");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRegistrations(env, entries) {
  await env.AGREEMENT_REGISTRY.put(
    "registrations",
    JSON.stringify(entries, null, 2),
  );
}

async function readPublicAccessState(env) {
  const raw = await env.AGREEMENT_REGISTRY.get("public_access_state");
  if (!raw) {
    return {
      publicUnlocked: false,
      updatedAt: "",
    };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      publicUnlocked: !!parsed.publicUnlocked,
      updatedAt: String(parsed.updatedAt || ""),
    };
  } catch {
    return {
      publicUnlocked: false,
      updatedAt: "",
    };
  }
}

async function writePublicAccessState(env, nextState) {
  await env.AGREEMENT_REGISTRY.put(
    "public_access_state",
    JSON.stringify(nextState, null, 2),
  );
}

function createChallengeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

async function readChallengeSession(env, code) {
  const normalized = String(code || "")
    .trim()
    .toUpperCase();
  if (!normalized) return null;
  const raw = await env.AGREEMENT_REGISTRY.get(`challenge:${normalized}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function writeChallengeSession(env, session) {
  const code = String(session.code || "")
    .trim()
    .toUpperCase();
  if (!code) {
    throw new Error("Challenge session code is missing.");
  }
  session.updatedAt = new Date().toISOString();
  await env.AGREEMENT_REGISTRY.put(
    `challenge:${code}`,
    JSON.stringify(session, null, 2),
    {
      expirationTtl: 60 * 60 * 24,
    },
  );
}

function summarizeVotes(session) {
  const votes = session.currentVotes || {};
  const counts = {};
  Object.values(votes).forEach((value) => {
    const key = String(value);
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function buildChallengeResponse(session, options = {}) {
  const {
    includeHostKey = false,
    includeAnswer = false,
    participantId = "",
  } = options;

  const question = session.questions[session.currentIndex] || null;
  const activeTeam = session.teams[session.turnIndex] || null;
  const participants = Array.isArray(session.participants)
    ? session.participants
    : [];
  const me = participants.find((entry) => entry.id === participantId) || null;

  return {
    ok: true,
    session: {
      code: session.code,
      hostName: session.hostName,
      started: !!session.started,
      completed: !!session.completed,
      theme: session.theme,
      questionCount: session.questionCount,
      timerSeconds: session.timerSeconds,
      currentIndex: session.currentIndex,
      questionStartedAt: String(session.questionStartedAt || ""),
      updatedAt: session.updatedAt,
      activeTeam: activeTeam ? activeTeam.name : "",
      teams: session.teams,
      participants: participants.map((entry) => ({
        id: entry.id,
        name: entry.name,
        teamName: entry.teamName,
      })),
      voteCounts: summarizeVotes(session),
      currentQuestion: question
        ? {
            prompt: question.prompt,
            choices: question.choices,
            category: question.category,
            theme: question.theme,
            bloom: question.bloom,
            objective: question.objective,
            explanation: session.revealed ? question.explanation : "",
            correctAnswer:
              includeAnswer || session.revealed ? question.correctAnswer : "",
            answer: includeAnswer || session.revealed ? question.answer : -1,
          }
        : null,
      revealed: !!session.revealed,
      selectedAnswer:
        typeof session.selectedAnswer === "number"
          ? session.selectedAnswer
          : -1,
      me,
    },
    ...(includeHostKey ? { host_key: session.hostKey } : {}),
  };
}

function normalizeChallengeTeams(rawTeams) {
  const seen = new Set();
  return (Array.isArray(rawTeams) ? rawTeams : [])
    .map((entry, index) => {
      const name =
        String((entry && entry.name) || entry || "").trim() ||
        `Team ${index + 1}`;
      return {
        id: String(index + 1),
        name,
        score: Number((entry && entry.score) || 0) || 0,
        correct: Number((entry && entry.correct) || 0) || 0,
      };
    })
    .filter((entry) => {
      const key = entry.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeChallengeQuestions(rawQuestions) {
  return (Array.isArray(rawQuestions) ? rawQuestions : [])
    .map((question, index) => ({
      id: String(question && question.id ? question.id : index + 1),
      prompt: String((question && question.prompt) || "").trim(),
      choices: Array.isArray(question && question.choices)
        ? question.choices
            .map((choice) => String(choice || "").trim())
            .filter(Boolean)
            .slice(0, 4)
        : [],
      answer: Number(question && question.answer),
      correctAnswer: String((question && question.correctAnswer) || "").trim(),
      explanation: String((question && question.explanation) || "").trim(),
      bloom: String((question && question.bloom) || "").trim(),
      bloomExplanation: String(
        (question && question.bloomExplanation) || "",
      ).trim(),
      objective: String((question && question.objective) || "").trim(),
      category: String((question && question.category) || "").trim(),
      theme: String((question && question.theme) || "").trim(),
    }))
    .filter(
      (question) =>
        question.prompt &&
        question.choices.length >= 2 &&
        Number.isInteger(question.answer) &&
        question.answer >= 0 &&
        question.answer < question.choices.length,
    );
}

async function createChallengeSessionRecord(env, payload) {
  const hostName = String(payload.host_name || "").trim() || "Teacher";
  const theme = String(payload.theme || "Mixed").trim() || "Mixed";
  const questionCount = Math.max(
    1,
    Math.min(20, Number(payload.question_count) || 10),
  );
  const timerSeconds = Math.max(
    10,
    Math.min(90, Number(payload.timer_seconds) || 20),
  );
  const questions = normalizeChallengeQuestions(payload.questions).slice(
    0,
    questionCount,
  );
  if (!questions.length) {
    throw new Error("Challenge session needs at least one question.");
  }

  const teams = normalizeChallengeTeams(payload.teams);
  if (!teams.length) {
    throw new Error("Challenge session needs at least one team.");
  }

  let code = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    code = createChallengeCode();
    const exists = await readChallengeSession(env, code);
    if (!exists) break;
    code = "";
  }
  if (!code) {
    throw new Error("Could not create a live challenge code. Try again.");
  }

  const session = {
    code,
    hostKey: crypto.randomUUID(),
    hostName,
    theme,
    questionCount: questions.length,
    timerSeconds,
    questions,
    currentIndex: 0,
    questionStartedAt: "",
    started: false,
    completed: false,
    revealed: false,
    selectedAnswer: -1,
    turnIndex: 0,
    teams,
    participants: [],
    currentVotes: {},
    updatedAt: new Date().toISOString(),
  };

  await writeChallengeSession(env, session);
  return session;
}

function requireChallengeHost(session, hostKey) {
  if (String(hostKey || "").trim() !== String(session.hostKey || "").trim()) {
    throw new Error("This live challenge host key is not valid.");
  }
}

function resetChallengeRoundVotes(session) {
  session.currentVotes = {};
  session.revealed = false;
  session.selectedAnswer = -1;
}

function buildRegistrationResponse(entries) {
  return {
    ok: true,
    entries,
    summary: {
      total_registrations: entries.length,
      newest_at: entries.length ? entries[0].submittedAt : "",
      newest_name: entries.length ? entries[0].name : "",
    },
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseDetails(detailsJson) {
  try {
    const parsed = JSON.parse(String(detailsJson || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function splitConfiguredList(value) {
  return String(value || "")
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildRegistrationNotification(record) {
  const details = parseDetails(record.detailsJson);
  const trackLine = details.tracks || record.role || "Track to be confirmed";
  const organizationLine =
    details.organization || record.organization || "Independent Registration";
  const locationLine = details.location || "Location to be confirmed";
  const referralLine = details.referral || "Not provided";
  const deliveryLine = details.delivery || "Not provided";
  const startLine = details.startDate || "Not provided";
  const classSizeLine = details.classSize || "Not provided";
  const supportLine = details.support || "Not provided";
  const extraNotes = details.extraNotes || record.notes || "None provided";

  const subject = `New Ready for Real Life registration: ${record.name || "Unknown"}`;
  const text = [
    "A new Ready for Real Life Instruction and Education registration was submitted.",
    "",
    `Name: ${record.name || "Not provided"}`,
    `Email: ${record.email || "Not provided"}`,
    `Phone: ${record.phone || "Not provided"}`,
    `Organization: ${organizationLine}`,
    `Program / Track: ${trackLine}`,
    `Location: ${locationLine}`,
    `Preferred delivery: ${deliveryLine}`,
    `Preferred start date: ${startLine}`,
    `Class size: ${classSizeLine}`,
    `Referral source: ${referralLine}`,
    "",
    `Support requested: ${supportLine}`,
    "",
    `Notes: ${extraNotes}`,
    "",
    `Registration ID: ${record.registrationId || ""}`,
    `Submitted: ${record.submittedAt || ""}`,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#1e293b;background:#f7f2e9;padding:24px;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #d9cfbd;border-radius:16px;overflow:hidden;">
        <div style="background:#18304f;color:#ffffff;padding:20px 24px;border-bottom:4px solid #c89b3c;">
          <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#e8c778;font-weight:700;">New Registration</div>
          <h1 style="margin:8px 0 0;font-size:26px;line-height:1.2;">Ready for Real Life Instruction and Education</h1>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">A new registration was submitted.</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;">
            <tr><td style="padding:8px 0;font-weight:700;">Name</td><td style="padding:8px 0;">${escapeHtml(record.name || "Not provided")}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;">Email</td><td style="padding:8px 0;">${escapeHtml(record.email || "Not provided")}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;">Phone</td><td style="padding:8px 0;">${escapeHtml(record.phone || "Not provided")}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;">Organization</td><td style="padding:8px 0;">${escapeHtml(organizationLine)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;">Program / Track</td><td style="padding:8px 0;">${escapeHtml(trackLine)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;">Location</td><td style="padding:8px 0;">${escapeHtml(locationLine)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;">Preferred delivery</td><td style="padding:8px 0;">${escapeHtml(deliveryLine)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;">Preferred start date</td><td style="padding:8px 0;">${escapeHtml(startLine)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;">Class size</td><td style="padding:8px 0;">${escapeHtml(classSizeLine)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;">Referral source</td><td style="padding:8px 0;">${escapeHtml(referralLine)}</td></tr>
          </table>
          <div style="margin-top:18px;padding:16px;border-radius:12px;background:#fbfaf7;border:1px solid #d9cfbd;">
            <p style="margin:0 0 10px;font-weight:700;">Support requested</p>
            <p style="margin:0 0 16px;line-height:1.6;">${escapeHtml(supportLine)}</p>
            <p style="margin:0 0 10px;font-weight:700;">Notes</p>
            <p style="margin:0;line-height:1.6;">${escapeHtml(extraNotes)}</p>
          </div>
          <p style="margin:18px 0 0;font-size:13px;color:#64748b;line-height:1.6;">Registration ID: ${escapeHtml(record.registrationId || "")}<br>Submitted: ${escapeHtml(record.submittedAt || "")}</p>
        </div>
      </div>
    </div>
  `;

  return { subject, text, html };
}

function resolveEmailLogoUrl(env) {
  const fallbackUrl =
    "https://raw.githubusercontent.com/readyforreallife/readyforreal.life/main/assets/mmmf-domain-icon.png";
  const configured = String(env.EMAIL_LOGO_URL || "").trim();
  if (!configured) return fallbackUrl;

  const legacyLogos = [
    "https://readyforreal.life/assets/logo-square.png",
    "https://readyforreal.life/assets/app-icon.png",
    "https://readyforreal.life/assets/mmmf-site-mark.svg",
    "https://readyforreal.life/assets/mmmf-email-avatar.png",
    "https://readyforreal.life/assets/mmmf-sender-icon.png",
    "https://readyforreal.life/assets/icons/icon-192-v2.png",
  ];

  return legacyLogos.includes(configured) ? fallbackUrl : configured;
}

function resolveResendFromName(env) {
  const configured = String(env.RESEND_FROM_NAME || "").trim();
  const fallbackName = "Ready for Real Life Instruction and Education";
  if (!configured) return fallbackName;

  const legacyNames = new Set([
    "Modern Manners & Mental Fortitude",
    "Modern Manners and Mental Fortitude",
    "Modern Manners & Mental Fortitude LLC",
    "Modern Manners and Mental Fortitude LLC",
    "Modern Manners & Mental Fortitude (MMMF) LLC",
    "Modern Manners and Mental Fortitude (MMMF) LLC",
  ]);

  return legacyNames.has(configured) ? fallbackName : configured;
}

function resolveFounderPhotoUrls() {
  return {
    michael: "https://readyforreal.life/michael-terry-headshot.jpg",
    mekenzi: "https://readyforreal.life/mekenzi-terry-headshot.png",
  };
}

function resolveGoogleSenderName() {
  return "Ready for Real Life Instruction and Education";
}

async function sendViaGoogleMail(env, payload) {
  const webhookUrl = String(env.GOOGLE_MAIL_WEBHOOK_URL || "").trim();
  if (!webhookUrl) {
    return {
      configured: false,
      sent: false,
      reason: "Google mail webhook is not configured yet.",
    };
  }

  const webhookSecret = String(env.GOOGLE_MAIL_WEBHOOK_SECRET || "").trim();
  const authValue = webhookSecret ? `Bearer ${webhookSecret}` : "";
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authValue ? { Authorization: authValue } : {}),
    },
    body: JSON.stringify({
      ...payload,
      ...(authValue ? { authorization: authValue } : {}),
    }),
  });

  const raw = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  if (!response.ok || (parsed && parsed.ok === false)) {
    return {
      configured: true,
      sent: false,
      reason:
        (parsed && (parsed.error || parsed.message)) ||
        raw ||
        "Google mail request failed.",
    };
  }

  return {
    configured: true,
    sent: true,
    id:
      (parsed && (parsed.id || parsed.messageId || parsed.message_id)) || "",
  };
}

async function sendRegistrationConfirmation(env, record) {
  if (!record.email) {
    return {
      configured: false,
      sent: false,
      reason: "No recipient email provided.",
    };
  }

  const details = parseDetails(record.detailsJson);
  const logoUrl = resolveEmailLogoUrl(env);
  const founderPhotos = resolveFounderPhotoUrls();
  const replyTo = "readyforreallife.mmmf@gmail.com";
  const fromName = resolveGoogleSenderName();
  const trackLine = details.tracks || record.role || "Track to be confirmed";
  const organizationLine =
    details.organization || record.organization || "Independent Registration";
  const locationLine = details.location || "Location to be confirmed";
  const subject =
    "Your Ready for Real Life Instruction and Education registration was received";

  const html = `
    <div style="margin:0;padding:0;background:#f7f2e9;font-family:Arial,sans-serif;color:#1e293b;">
      <div style="max-width:680px;margin:0 auto;padding:28px 16px;">
        <div style="background:#ffffff;border:1px solid #d9cfbd;border-radius:20px;overflow:hidden;">
          <div style="background:#18304f;padding:28px 28px 20px;border-bottom:4px solid #c89b3c;text-align:center;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 auto 18px;max-width:420px;">
              <tr>
                <td align="center" valign="middle" style="width:116px;padding-right:10px;">
                  <img src="${escapeHtml(founderPhotos.michael)}" alt="Michael Terry" style="width:84px;height:84px;display:block;margin:0 auto;border-radius:999px;border:3px solid #c89b3c;object-fit:cover;">
                </td>
                <td align="center" valign="middle" style="width:188px;">
                  <img src="${escapeHtml(logoUrl)}" alt="Ready for Real Life Instruction and Education" style="width:116px;height:116px;display:block;margin:0 auto;border-radius:24px;">
                </td>
                <td align="center" valign="middle" style="width:116px;padding-left:10px;">
                  <img src="${escapeHtml(founderPhotos.mekenzi)}" alt="Mekenzi Terry" style="width:84px;height:84px;display:block;margin:0 auto;border-radius:999px;border:3px solid #c89b3c;object-fit:cover;">
                </td>
              </tr>
            </table>
            <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#e8c778;font-weight:700;">Registration Confirmation</div>
            <h1 style="margin:10px 0 0;color:#ffffff;font-size:32px;line-height:1.2;">Ready for Real Life Instruction and Education</h1>
            <div style="margin:8px 0 0;color:#d9cfbd;font-size:13px;line-height:1.5;">Real-World Life Skills Program</div>
          </div>
          <div style="padding:28px;">
            <p style="margin:0 0 16px;font-size:17px;line-height:1.7;">Hi ${escapeHtml(record.name || "there")},</p>
            <p style="margin:0 0 8px;font-size:16px;line-height:1.7;">We&rsquo;re glad you&rsquo;re here. We received your registration for <strong>Ready for Real Life Instruction and Education</strong> and are excited to connect with you.</p>
            <p style="margin:0 0 20px;font-size:16px;line-height:1.7;">&mdash; Mike &amp; Mekenzi</p>
            <div style="background:#fbfaf7;border:1px solid #d9cfbd;border-radius:16px;padding:18px 18px 8px;margin-bottom:20px;">
              <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:12px;">Registration Summary</div>
              <p style="margin:0 0 10px;font-size:15px;"><strong>Name:</strong> ${escapeHtml(record.name || "—")}</p>
              <p style="margin:0 0 10px;font-size:15px;"><strong>Email:</strong> ${escapeHtml(record.email || "—")}</p>
              <p style="margin:0 0 10px;font-size:15px;"><strong>Organization:</strong> ${escapeHtml(organizationLine)}</p>
              <p style="margin:0 0 10px;font-size:15px;"><strong>Program / Track:</strong> ${escapeHtml(trackLine)}</p>
              <p style="margin:0 0 10px;font-size:15px;"><strong>Location:</strong> ${escapeHtml(locationLine)}</p>
            </div>
            <div style="margin-bottom:20px;">
              <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:12px;">What You Signed Up For</div>
              <p style="margin:0 0 10px;font-size:15px;line-height:1.7;">You registered interest in Ready for Real Life Instruction and Education (MMMF) and its training or implementation pathway. Depending on your role, this may lead to program enrollment, track placement, scheduling, support planning, or Teach the Teacher follow-up.</p>
            </div>
            <div style="margin-bottom:20px;">
              <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:12px;">What Happens Next</div>
              <p style="margin:0 0 12px;font-size:15px;line-height:1.7;">We&rsquo;ll take a look at your registration and follow up with the next step that fits your goals. This could include training details, scheduling options, onboarding information, or program placement.</p>
              <p style="margin:0;font-size:15px;line-height:1.7;">If we need anything else from you, we&rsquo;ll reach out using the contact information you provided.</p>
            </div>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.7;">If you have any questions in the meantime, feel free to reach out to us at <a href="mailto:readyforreal.life44@gmail.com" style="color:#18304f;font-weight:700;">readyforreal.life44@gmail.com</a>.</p>
            <p style="margin:0;font-size:15px;line-height:1.7;">We&rsquo;re looking forward to working with you.</p>
            <p style="margin:16px 0 0;font-size:14px;color:#64748b;line-height:1.7;">Mike Terry &amp; Mekenzi Terry<br>Founders, Ready for Real Life Instruction and Education | MMMF LLC</p>
          </div>
        </div>
      </div>
    </div>
  `;

  const text = [
    `Hi ${record.name || "there"},`,
    "",
    "We’re glad you’re here. We received your registration for Ready for Real Life Instruction and Education and are excited to connect with you.",
    "",
    "— Mike & Mekenzi",
    "",
    "Registration summary:",
    `Name: ${record.name || "—"}`,
    `Email: ${record.email || "—"}`,
    `Organization: ${organizationLine}`,
    `Program / Track: ${trackLine}`,
    `Location: ${locationLine}`,
    "",
    "What You Signed Up For:",
    "You registered interest in Ready for Real Life Instruction and Education (MMMF) and its training or implementation pathway. Depending on your role, this may lead to program enrollment, track placement, scheduling, support planning, or Teach the Teacher follow-up.",
    "",
    "What Happens Next:",
    "We’ll take a look at your registration and follow up with the next step that fits your goals. This could include training details, scheduling options, onboarding information, or program placement.",
    "",
    "If we need anything else from you, we’ll reach out using the contact information you provided.",
    "",
    "If you have any questions in the meantime, feel free to reach out to us at readyforreal.life44@gmail.com.",
    "",
    "We’re looking forward to working with you.",
    "",
    "Mike Terry & Mekenzi Terry",
    "Founders, Ready for Real Life Instruction and Education | MMMF LLC",
  ].join("\n");

  const googleResult = await sendViaGoogleMail(env, {
    action: "send_registration_confirmation",
    to: record.email,
    subject,
    html,
    text,
    replyTo,
    senderName: fromName,
    registrationId: String(record.registrationId || ""),
  });
  if (googleResult.configured) {
    return googleResult;
  }

  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    return {
      configured: false,
      sent: false,
      reason: "Neither Google mail nor Resend is configured yet.",
    };
  }

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${fromName} <${env.RESEND_FROM_EMAIL}>`,
      to: [record.email],
      reply_to: replyTo,
      subject,
      html,
      text,
    }),
  });

  const raw = await resendResponse.text();
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  if (!resendResponse.ok) {
    return {
      configured: true,
      sent: false,
      reason:
        (parsed && (parsed.message || parsed.error)) ||
        raw ||
        "Email request failed.",
    };
  }

  return {
    configured: true,
    sent: true,
    id: parsed && parsed.id ? parsed.id : "",
  };
}

async function sendRegistrationOwnerEmail(env, record) {
  const recipients = splitConfiguredList(
    env.REGISTRATION_NOTIFY_EMAIL || env.NOTIFY_EMAIL || env.ADMIN_EMAIL,
  );
  if (!recipients.length) {
    return {
      configured: false,
      sent: false,
      reason: "REGISTRATION_NOTIFY_EMAIL is not configured yet.",
    };
  }

  const notification = buildRegistrationNotification(record);
  const replyTo = record.email || "readyforreal.life44@gmail.com";
  const googleResult = await sendViaGoogleMail(env, {
    action: "send_registration_owner_notification",
    to: recipients.join(","),
    subject: notification.subject,
    html: notification.html,
    text: notification.text,
    replyTo,
    senderName: resolveGoogleSenderName(),
    registrationId: String(record.registrationId || ""),
  });
  if (googleResult.configured) {
    return googleResult;
  }

  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    return {
      configured: false,
      sent: false,
      reason: "Neither Google mail nor Resend is configured for owner notifications.",
    };
  }

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${resolveResendFromName(env)} <${env.RESEND_FROM_EMAIL}>`,
      to: recipients,
      reply_to: replyTo,
      subject: notification.subject,
      html: notification.html,
      text: notification.text,
    }),
  });

  const raw = await resendResponse.text();
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  if (!resendResponse.ok) {
    return {
      configured: true,
      sent: false,
      reason:
        (parsed && (parsed.message || parsed.error)) ||
        raw ||
        "Owner email request failed.",
    };
  }

  return {
    configured: true,
    sent: true,
    id: parsed && parsed.id ? parsed.id : "",
  };
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function hmacSha256Hex(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return bytesToHex(signature);
}

async function verifyStripeSignature(env, request, rawBody) {
  const webhookSecret = String(env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  }

  const signatureHeader = request.headers.get("Stripe-Signature") || "";
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [String(key || "").trim(), String(value || "").trim()];
    }),
  );
  const timestamp = parts.t || "";
  const expectedSignature = parts.v1 || "";
  if (!timestamp || !expectedSignature) {
    throw new Error("Stripe signature header is missing required values.");
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const actualSignature = await hmacSha256Hex(webhookSecret, signedPayload);
  if (!timingSafeEqual(actualSignature, expectedSignature)) {
    throw new Error("Stripe signature did not match.");
  }
}

async function markSupabaseEnrollmentPaid(env, payment) {
  const supabaseUrl = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase webhook settings are not configured.");
  }

  const email = String(payment.email || "").trim().toLowerCase();
  if (!email) {
    throw new Error("Stripe payment did not include an email address.");
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/course_enrollments?email=eq.${encodeURIComponent(email)}`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        payment_status: "paid",
        stripe_checkout_session_id: String(payment.sessionId || ""),
        payment_amount_cents:
          Number.isFinite(payment.amountCents) && payment.amountCents > 0
            ? payment.amountCents
            : null,
        payment_currency: String(payment.currency || "").toLowerCase(),
        paid_at: payment.paidAt || new Date().toISOString(),
      }),
    },
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || "Could not update Supabase payment status.");
  }

  let rows = [];
  try {
    rows = text ? JSON.parse(text) : [];
  } catch {
    rows = [];
  }

  return {
    email,
    updated: Array.isArray(rows) ? rows.length : 0,
  };
}

async function handleStripeWebhook(request, env, headers) {
  const rawBody = await request.text();
  await verifyStripeSignature(env, request, rawBody);
  const event = JSON.parse(rawBody);

  if (event.type !== "checkout.session.completed") {
    return json({ ok: true, ignored: event.type || "" }, 200, headers);
  }

  const session = event.data && event.data.object ? event.data.object : {};
  if (String(session.payment_status || "").toLowerCase() !== "paid") {
    return json({ ok: true, ignored: "checkout session was not paid" }, 200, headers);
  }

  const result = await markSupabaseEnrollmentPaid(env, {
    email:
      session.customer_details && session.customer_details.email
        ? session.customer_details.email
        : session.customer_email || "",
    sessionId: session.id || "",
    amountCents: Number(session.amount_total || 0),
    currency: session.currency || "",
    paidAt: new Date((Number(session.created || 0) || Date.now() / 1000) * 1000).toISOString(),
  });

  return json({ ok: true, ...result }, 200, headers);
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(env, request);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "Method Not Allowed" }, 405, headers);
    }

    if (!env.AGREEMENT_REGISTRY) {
      return json(
        {
          ok: false,
          error: "KV binding AGREEMENT_REGISTRY is missing from this Worker.",
        },
        500,
        headers,
      );
    }

    if (url.pathname === "/stripe-webhook") {
      try {
        return await handleStripeWebhook(request, env, headers);
      } catch (error) {
        return json(
          { ok: false, error: error.message || "Stripe webhook failed." },
          400,
          headers,
        );
      }
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON payload." }, 400, headers);
    }

    const action = String(payload.action || "")
      .trim()
      .toLowerCase();

    try {
      if (action === "admin_login") {
        if (!env.ADMIN_CODE) {
          return json(
            {
              ok: false,
              error: "ADMIN_CODE secret is missing from this Worker.",
            },
            500,
            headers,
          );
        }

        if (String(payload.access_code || "") !== String(env.ADMIN_CODE)) {
          return json(
            { ok: false, error: "Incorrect access code." },
            401,
            headers,
          );
        }

        const sessionToken = await createSession(env);
        return json(
          {
            ok: true,
            session_token: sessionToken,
            expires_in_seconds: 60 * 60 * 6,
          },
          200,
          headers,
        );
      }

      if (action === "agreement_list") {
        await requireSession(env, payload.session_token);
        const entries = await readRegistry(env);
        return json(buildRegistryResponse(entries), 200, headers);
      }

      if (action === "certificate_get") {
        await requireSession(env, payload.session_token);
        const agreementNumber = normalizeAgreementNumber(
          payload.agreement_number || "",
        );
        const entries = await readRegistry(env);
        const record = entries.find(
          (entry) => entry.agreementNumber === agreementNumber,
        );
        if (!record) {
          return json(
            { ok: false, error: "Certificate record not found." },
            404,
            headers,
          );
        }
        return json({ ok: true, record }, 200, headers);
      }

      if (action === "agreement_issue") {
        await requireSession(env, payload.session_token);

        const fullName = String(payload.full_name || "").trim();
        if (!fullName) {
          return json(
            { ok: false, error: "Full name is required." },
            400,
            headers,
          );
        }

        const entries = await readRegistry(env);
        const requestedNumber = normalizeAgreementNumber(
          payload.agreement_number || nextAgreementNumber(entries),
        );
        const email = String(payload.email || "").trim();
        const organization = String(payload.organization || "").trim();
        const certificateType =
          String(payload.certificate_type || "completion")
            .trim()
            .toLowerCase() === "facilitator"
            ? "facilitator"
            : "completion";
        const track = String(payload.track || "").trim();
        const effectiveDate = String(payload.effective_date || "").trim();
        const status = String(payload.status || "Issued").trim();
        const notes = String(payload.notes || "").trim();

        const duplicateNumber = entries.find(
          (entry) => entry.agreementNumber === requestedNumber,
        );
        if (duplicateNumber) {
          return json(
            {
              ok: false,
              error: `Agreement number ${requestedNumber} has already been assigned to ${duplicateNumber.fullName}.`,
              conflict_type: "agreement_number",
            },
            409,
            headers,
          );
        }

        const duplicatePerson = entries.find((entry) => {
          const sameName =
            String(entry.fullName || "").toLowerCase() ===
            fullName.toLowerCase();
          const sameEmail =
            email &&
            String(entry.email || "").toLowerCase() === email.toLowerCase();
          return sameName && sameEmail;
        });
        if (duplicatePerson) {
          return json(
            {
              ok: false,
              error: `${duplicatePerson.fullName} already has agreement number ${duplicatePerson.agreementNumber}.`,
              conflict_type: "person",
            },
            409,
            headers,
          );
        }

        const record = {
          agreementNumber: requestedNumber,
          fullName,
          email,
          organization,
          certificateType,
          track,
          effectiveDate,
          status,
          notes,
          issuedAt: new Date().toISOString(),
        };

        entries.push(record);
        await writeRegistry(env, entries);

        return json(
          {
            ok: true,
            record,
            entries,
            next_number: nextAgreementNumber(entries),
          },
          200,
          headers,
        );
      }

      if (action === "agreement_delete") {
        await requireSession(env, payload.session_token);
        const agreementNumber = normalizeAgreementNumber(
          payload.agreement_number || "",
        );
        if (!agreementNumber) {
          return json(
            { ok: false, error: "Agreement number is required." },
            400,
            headers,
          );
        }
        const entries = await readRegistry(env);
        const nextEntries = entries.filter(
          (entry) => entry.agreementNumber !== agreementNumber,
        );
        if (nextEntries.length === entries.length) {
          return json(
            { ok: false, error: "Certificate record not found." },
            404,
            headers,
          );
        }
        await writeRegistry(env, nextEntries);
        return json(buildRegistryResponse(nextEntries), 200, headers);
      }

      if (action === "registration_submit") {
        const registrations = await readRegistrations(env);
        const name = String(payload.name || "").trim();
        const email = String(payload.email || "").trim();
        const phone = String(payload.phone || "").trim();
        const submittedAt = String(
          payload.timestamp || new Date().toISOString(),
        );
        const registrationId = crypto.randomUUID();

        const record = {
          registrationId,
          name,
          email,
          phone,
          role: String(payload.group || "").trim(),
          organization: String(payload.organization || "").trim(),
          program: String(
            payload.program || "Ready for Real Life Instruction and Education",
          ).trim(),
          notes: String(payload.notes || "").trim(),
          detailsJson: String(payload.details_json || "").trim(),
          submittedAt,
          status: "New",
        };

        registrations.unshift(record);

        await writeRegistrations(env, registrations);
        const emailResult = await sendRegistrationConfirmation(env, record);
        const ownerEmailResult = await sendRegistrationOwnerEmail(env, record);

        return json(
          {
            ok: true,
            registration_id: registrationId,
            email_sent: !!emailResult.sent,
            email_service_configured: !!emailResult.configured,
            email_error: emailResult.sent
              ? ""
              : String(emailResult.reason || ""),
            email_id: String(emailResult.id || ""),
            owner_email_sent: !!ownerEmailResult.sent,
            owner_email_service_configured: !!ownerEmailResult.configured,
            owner_email_error: ownerEmailResult.sent
              ? ""
              : String(ownerEmailResult.reason || ""),
            owner_email_id: String(ownerEmailResult.id || ""),
          },
          200,
          headers,
        );
      }

      if (action === "public_access_get") {
        const state = await readPublicAccessState(env);
        return json({ ok: true, ...state }, 200, headers);
      }

      if (action === "public_access_set") {
        if (!env.ADMIN_CODE) {
          return json(
            {
              ok: false,
              error: "ADMIN_CODE secret is missing from this Worker.",
            },
            500,
            headers,
          );
        }
        if (
          String(payload.access_code || "").trim() !== String(env.ADMIN_CODE)
        ) {
          return json(
            { ok: false, error: "Incorrect access code." },
            401,
            headers,
          );
        }
        const nextState = {
          publicUnlocked: !!payload.public_unlocked,
          updatedAt: new Date().toISOString(),
        };
        await writePublicAccessState(env, nextState);
        return json({ ok: true, ...nextState }, 200, headers);
      }

      if (action === "registration_list") {
        await requireSession(env, payload.session_token);
        const registrations = await readRegistrations(env);
        return json(buildRegistrationResponse(registrations), 200, headers);
      }

      if (action === "registration_delete") {
        await requireSession(env, payload.session_token);
        const registrationId = String(payload.registration_id || "").trim();
        if (!registrationId) {
          return json(
            { ok: false, error: "Registration ID is required." },
            400,
            headers,
          );
        }
        const registrations = await readRegistrations(env);
        const nextRegistrations = registrations.filter(
          (entry) => String(entry.registrationId || "") !== registrationId,
        );
        if (nextRegistrations.length === registrations.length) {
          return json(
            { ok: false, error: "Registration record not found." },
            404,
            headers,
          );
        }
        await writeRegistrations(env, nextRegistrations);
        return json(buildRegistrationResponse(nextRegistrations), 200, headers);
      }

      if (action === "challenge_create") {
        const session = await createChallengeSessionRecord(env, payload);
        return json(
          buildChallengeResponse(session, { includeHostKey: true }),
          200,
          headers,
        );
      }

      if (action === "challenge_get") {
        const session = await readChallengeSession(env, payload.code);
        if (!session) {
          return json(
            { ok: false, error: "Live challenge not found." },
            404,
            headers,
          );
        }
        const includeHostKey =
          String(payload.host_key || "").trim() ===
          String(session.hostKey || "").trim();
        const includeAnswer = includeHostKey && !!session.revealed;
        return json(
          buildChallengeResponse(session, {
            includeHostKey,
            includeAnswer,
            participantId: String(payload.participant_id || "").trim(),
          }),
          200,
          headers,
        );
      }

      if (action === "challenge_join") {
        const session = await readChallengeSession(env, payload.code);
        if (!session) {
          return json(
            { ok: false, error: "Live challenge not found." },
            404,
            headers,
          );
        }

        const participantName = String(payload.name || "").trim();
        if (!participantName) {
          return json(
            { ok: false, error: "Participant name is required." },
            400,
            headers,
          );
        }

        const teamName = String(payload.team_name || "").trim();
        const teamMatch =
          session.teams.find((entry) => entry.name === teamName) ||
          session.teams[0];
        if (!teamMatch) {
          return json(
            {
              ok: false,
              error: "No team is available for this live challenge.",
            },
            400,
            headers,
          );
        }

        const participantId = crypto.randomUUID();
        session.participants = Array.isArray(session.participants)
          ? session.participants
          : [];
        session.participants.push({
          id: participantId,
          name: participantName,
          teamName: teamMatch.name,
          joinedAt: new Date().toISOString(),
        });
        await writeChallengeSession(env, session);

        return json(
          buildChallengeResponse(session, {
            participantId,
          }),
          200,
          headers,
        );
      }

      if (action === "challenge_start") {
        const session = await readChallengeSession(env, payload.code);
        if (!session) {
          return json(
            { ok: false, error: "Live challenge not found." },
            404,
            headers,
          );
        }
        requireChallengeHost(session, payload.host_key);
        session.started = true;
        session.completed = false;
        session.currentIndex = 0;
        session.questionStartedAt = new Date().toISOString();
        session.turnIndex = 0;
        session.teams = normalizeChallengeTeams(session.teams);
        session.teams.forEach((team) => {
          team.score = 0;
          team.correct = 0;
        });
        resetChallengeRoundVotes(session);
        await writeChallengeSession(env, session);
        return json(
          buildChallengeResponse(session, { includeHostKey: true }),
          200,
          headers,
        );
      }

      if (action === "challenge_submit_vote") {
        const session = await readChallengeSession(env, payload.code);
        if (!session) {
          return json(
            { ok: false, error: "Live challenge not found." },
            404,
            headers,
          );
        }
        if (!session.started || session.completed) {
          return json(
            {
              ok: false,
              error: "This live challenge is not accepting votes right now.",
            },
            400,
            headers,
          );
        }
        if (session.revealed) {
          return json(
            { ok: false, error: "Voting for this question is closed." },
            400,
            headers,
          );
        }

        const participantId = String(payload.participant_id || "").trim();
        const participant = (session.participants || []).find(
          (entry) => entry.id === participantId,
        );
        if (!participant) {
          return json(
            {
              ok: false,
              error: "Participant not found for this live challenge.",
            },
            404,
            headers,
          );
        }

        const choice = Number(payload.choice_index);
        const question = session.questions[session.currentIndex];
        if (
          !question ||
          !Number.isInteger(choice) ||
          choice < 0 ||
          choice >= question.choices.length
        ) {
          return json(
            { ok: false, error: "That vote is not valid for this question." },
            400,
            headers,
          );
        }

        session.currentVotes = session.currentVotes || {};
        session.currentVotes[participantId] = choice;
        await writeChallengeSession(env, session);
        return json(
          buildChallengeResponse(session, { participantId }),
          200,
          headers,
        );
      }

      if (action === "challenge_host_answer") {
        const session = await readChallengeSession(env, payload.code);
        if (!session) {
          return json(
            { ok: false, error: "Live challenge not found." },
            404,
            headers,
          );
        }
        requireChallengeHost(session, payload.host_key);
        if (!session.started || session.completed) {
          return json(
            { ok: false, error: "This live challenge is not active." },
            400,
            headers,
          );
        }

        const question = session.questions[session.currentIndex];
        if (!question) {
          return json(
            { ok: false, error: "No active question found." },
            404,
            headers,
          );
        }

        const selectedAnswer = Number(payload.selected_answer);
        if (
          !Number.isInteger(selectedAnswer) ||
          selectedAnswer < 0 ||
          selectedAnswer >= question.choices.length
        ) {
          return json(
            { ok: false, error: "Selected answer is not valid." },
            400,
            headers,
          );
        }

        session.selectedAnswer = selectedAnswer;
        session.revealed = true;
        const activeTeam = session.teams[session.turnIndex] || null;
        if (activeTeam && selectedAnswer === question.answer) {
          const participantCount = Object.keys(
            session.currentVotes || {},
          ).length;
          const awarded = 500 + participantCount * 75;
          activeTeam.score += awarded;
          activeTeam.correct += 1;
        }
        await writeChallengeSession(env, session);
        return json(
          buildChallengeResponse(session, {
            includeHostKey: true,
            includeAnswer: true,
          }),
          200,
          headers,
        );
      }

      if (action === "challenge_next") {
        const session = await readChallengeSession(env, payload.code);
        if (!session) {
          return json(
            { ok: false, error: "Live challenge not found." },
            404,
            headers,
          );
        }
        requireChallengeHost(session, payload.host_key);
        if (!session.started) {
          return json(
            { ok: false, error: "This live challenge has not started yet." },
            400,
            headers,
          );
        }

        if (session.currentIndex >= session.questions.length - 1) {
          session.completed = true;
          session.revealed = true;
          await writeChallengeSession(env, session);
          return json(
            buildChallengeResponse(session, {
              includeHostKey: true,
              includeAnswer: true,
            }),
            200,
            headers,
          );
        }

        session.currentIndex += 1;
        session.questionStartedAt = new Date().toISOString();
        session.turnIndex = session.teams.length
          ? (session.turnIndex + 1) % session.teams.length
          : 0;
        resetChallengeRoundVotes(session);
        await writeChallengeSession(env, session);
        return json(
          buildChallengeResponse(session, { includeHostKey: true }),
          200,
          headers,
        );
      }

      return json({ ok: false, error: "Unknown action." }, 400, headers);
    } catch (error) {
      return json(
        { ok: false, error: error.message || "Worker request failed." },
        500,
        headers,
      );
    }
  },
};
