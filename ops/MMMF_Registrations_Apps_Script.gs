function doPost(e) {
  try {
    var payload = parsePayload_(e);
    var action = normalizeRoute_(payload.action || '');
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === 'admin_login') {
      return jsonResponse_(handleAdminLogin_(payload));
    }

    if (action === 'agreement_list') {
      requireAgreementAdmin_(payload);
      return jsonResponse_(buildAgreementRegistryResponse_(ss));
    }

    if (action === 'agreement_issue') {
      requireAgreementAdmin_(payload);
      return jsonResponse_(handleAgreementIssue_(ss, payload));
    }

    if (String(payload.type || '').toLowerCase() === 'registration' && String(payload.registration_kind || '').toLowerCase() === 'mmmf') {
      var result = handleMmmfRegistration_(ss, payload);
      maybeSendMmmfNotification_(payload, result);
      return jsonResponse_({ ok: true, route: 'mmmf', row: result.rowNumber, sheet: result.sheetName });
    }

    var fallback = handleGenericRegistration_(ss, payload);
    return jsonResponse_({ ok: true, route: 'generic', row: fallback.rowNumber, sheet: fallback.sheetName });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err && err.message || err) });
  }
}

function parsePayload_(e) {
  var raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
  var payload = JSON.parse(raw);
  return payload && typeof payload === 'object' ? payload : {};
}

function normalizeRoute_(value) {
  return String(value || '').trim().toLowerCase();
}

function getSetting_(key, fallback) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  return value == null || value === '' ? fallback : value;
}

function handleAdminLogin_(payload) {
  var expectedCode = getSetting_('MMMF_ADMIN_CODE', '');
  if (!expectedCode) {
    return {
      ok: false,
      error: 'The admin access code has not been configured in Script Properties yet.'
    };
  }

  if (String(payload.access_code || '') !== String(expectedCode)) {
    return { ok: false, error: 'Incorrect access code.' };
  }

  var token = Utilities.getUuid();
  var cache = CacheService.getScriptCache();
  var expiresInSeconds = 21600;
  cache.put('mmmf_admin_session_' + token, JSON.stringify({ issuedAt: new Date().toISOString() }), expiresInSeconds);

  return {
    ok: true,
    session_token: token,
    expires_in_seconds: expiresInSeconds
  };
}

function requireAgreementAdmin_(payload) {
  var token = String(payload.session_token || '').trim();
  if (!token) throw new Error('Missing admin session.');

  var cache = CacheService.getScriptCache();
  var session = cache.get('mmmf_admin_session_' + token);
  if (!session) throw new Error('Your admin session expired. Sign in again.');

  cache.put('mmmf_admin_session_' + token, session, 21600);
}

function agreementHeaders_() {
  return [
    'agreement_number',
    'full_name',
    'email',
    'organization',
    'track',
    'effective_date',
    'status',
    'notes',
    'issued_at'
  ];
}

function getAgreementSheet_(ss) {
  var sheetName = getSetting_('MMMF_AGREEMENT_SHEET', 'MMMF Agreements');
  var sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  ensureHeaders_(sheet, agreementHeaders_());
  return sheet;
}

function normalizeAgreementNumber_(value) {
  var trimmed = String(value || '').trim().toUpperCase();
  if (!trimmed) return '';
  if (trimmed.indexOf('MMMF-') === 0) return trimmed;
  return 'MMMF-' + trimmed.replace(/^MMMF-?/i, '');
}

function agreementNumberDigits_(value) {
  var match = String(value || '').match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

function formatAgreementNumber_(number) {
  return 'MMMF-' + ('0000' + String(number)).slice(-4);
}

function mapAgreementEntries_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  return values.slice(1).map(function(row) {
    return {
      agreementNumber: String(row[0] || ''),
      fullName: String(row[1] || ''),
      email: String(row[2] || ''),
      organization: String(row[3] || ''),
      track: String(row[4] || ''),
      effectiveDate: String(row[5] || ''),
      status: String(row[6] || ''),
      notes: String(row[7] || ''),
      issuedAt: String(row[8] || '')
    };
  }).filter(function(entry) {
    return entry.agreementNumber || entry.fullName || entry.email;
  });
}

function nextAgreementNumber_(entries) {
  var highest = entries.reduce(function(max, entry) {
    return Math.max(max, agreementNumberDigits_(entry.agreementNumber));
  }, 0);
  return formatAgreementNumber_(Math.max(highest + 1, 1));
}

function buildAgreementRegistryResponse_(ss) {
  var sheet = getAgreementSheet_(ss);
  var entries = mapAgreementEntries_(sheet);
  return {
    ok: true,
    entries: entries,
    next_number: nextAgreementNumber_(entries),
    summary: {
      total_issued: entries.length,
      total_signed: entries.filter(function(entry) { return entry.status === 'Signed'; }).length,
      total_pending: entries.filter(function(entry) { return entry.status === 'Pending signature'; }).length,
      highest_number: ('0000' + String(entries.reduce(function(max, entry) {
        return Math.max(max, agreementNumberDigits_(entry.agreementNumber));
      }, 0))).slice(-4)
    }
  };
}

function handleAgreementIssue_(ss, payload) {
  var fullName = String(payload.full_name || '').trim();
  if (!fullName) return { ok: false, error: 'Full name is required.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var sheet = getAgreementSheet_(ss);
    var entries = mapAgreementEntries_(sheet);
    var requestedNumber = normalizeAgreementNumber_(payload.agreement_number || nextAgreementNumber_(entries));
    var email = String(payload.email || '').trim();
    var organization = String(payload.organization || '').trim();
    var track = String(payload.track || '').trim();
    var effectiveDate = String(payload.effective_date || '').trim();
    var status = String(payload.status || 'Issued').trim();
    var notes = String(payload.notes || '').trim();

    var duplicateNumber = entries.find(function(entry) {
      return entry.agreementNumber === requestedNumber;
    });
    if (duplicateNumber) {
      return {
        ok: false,
        error: 'Agreement number ' + requestedNumber + ' has already been assigned to ' + duplicateNumber.fullName + '.',
        conflict_type: 'agreement_number'
      };
    }

    var duplicatePerson = entries.find(function(entry) {
      var sameName = String(entry.fullName || '').toLowerCase() === fullName.toLowerCase();
      var sameEmail = email && String(entry.email || '').toLowerCase() === email.toLowerCase();
      return sameName && sameEmail;
    });
    if (duplicatePerson) {
      return {
        ok: false,
        error: duplicatePerson.fullName + ' already has agreement number ' + duplicatePerson.agreementNumber + '.',
        conflict_type: 'person'
      };
    }

    var issuedAt = new Date().toISOString();
    sheet.appendRow([
      requestedNumber,
      fullName,
      email,
      organization,
      track,
      effectiveDate,
      status,
      notes,
      issuedAt
    ]);

    var updatedEntries = mapAgreementEntries_(sheet);
    return {
      ok: true,
      record: {
        agreementNumber: requestedNumber,
        fullName: fullName,
        email: email,
        organization: organization,
        track: track,
        effectiveDate: effectiveDate,
        status: status,
        notes: notes,
        issuedAt: issuedAt
      },
      entries: updatedEntries,
      next_number: nextAgreementNumber_(updatedEntries)
    };
  } finally {
    lock.releaseLock();
  }
}

function handleGenericRegistration_(ss, payload) {
  var sheet = ss.getSheetByName('Registrations') || ss.insertSheet('Registrations');
  var headers = ['name', 'email', 'phone', 'group', 'notes', 'timestamp'];
  ensureHeaders_(sheet, headers);
  var row = [
    payload.name || '',
    payload.email || '',
    payload.phone || '',
    payload.group || '',
    payload.notes || '',
    payload.timestamp || new Date().toISOString()
  ];
  sheet.appendRow(row);
  return { sheetName: sheet.getName(), rowNumber: sheet.getLastRow() };
}

function handleMmmfRegistration_(ss, payload) {
  var sheetName = payload.sheet_name || 'MMMF Registrations';
  var sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  var headers = [
    'timestamp', 'name', 'email', 'phone', 'role_and_tracks', 'program', 'organization', 'location', 'referral',
    'tracks', 'delivery', 'start_date', 'class_size', 'training_status', 'population', 'gaps_identified',
    'sel_confidence', 'support_needed', 'additional_notes', 'summary_notes', 'details_json'
  ];
  ensureHeaders_(sheet, headers);

  var details = {};
  try {
    details = payload.details_json ? JSON.parse(payload.details_json) : {};
  } catch (_err) {
    details = {};
  }

  var row = [
    payload.timestamp || new Date().toISOString(),
    payload.name || '',
    payload.email || '',
    payload.phone || '',
    payload.group || '',
    payload.program || 'Ready for Real Life Instruction and Education',
    details.organization || '',
    details.location || '',
    details.referral || '',
    details.tracks || '',
    details.delivery || '',
    details.startDate || '',
    details.classSize || '',
    details.training || '',
    details.population || '',
    details.gaps || '',
    details.confidence || '',
    details.support || '',
    details.extraNotes || '',
    payload.notes || '',
    payload.details_json || ''
  ];

  sheet.appendRow(row);
  return { sheetName: sheet.getName(), rowNumber: sheet.getLastRow() };
}

function maybeSendMmmfNotification_(payload, result) {
  if (String(payload.send_email_notification || '').toLowerCase() !== 'true') return;
  var recipient = payload.notify_email || Session.getActiveUser().getEmail();
  if (!recipient) return;

  var subject = payload.notification_subject || 'New Ready for Real Life Instruction and Education registration submission';
  var body = [
    'A new Ready for Real Life Instruction and Education registration was submitted.',
    '',
    'Sheet: ' + result.sheetName,
    'Row: ' + result.rowNumber,
    '',
    'Name: ' + (payload.name || ''),
    'Email: ' + (payload.email || ''),
    'Phone: ' + (payload.phone || ''),
    'Role / Tracks: ' + (payload.group || ''),
    '',
    'Summary:',
    payload.notes || '',
    '',
    'Raw details JSON:',
    payload.details_json || ''
  ].join('\n');

  MailApp.sendEmail(recipient, subject, body);
}

function ensureHeaders_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    return;
  }
  var existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var matches = headers.every(function(header, idx) {
    return String(existing[idx] || '') === header;
  });
  if (!matches) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}


function migrateMalformedMmmfRows_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var source = ss.getSheetByName('Registrations') || ss.getSheetByName('Decision Lab Responses');
  if (!source) return;
  var target = ss.getSheetByName('MMMF Registrations') || ss.insertSheet('MMMF Registrations');
  var headers = [
    'timestamp', 'name', 'email', 'phone', 'role_and_tracks', 'program', 'organization', 'location', 'referral',
    'tracks', 'delivery', 'start_date', 'class_size', 'training_status', 'population', 'gaps_identified',
    'sel_confidence', 'support_needed', 'additional_notes', 'summary_notes', 'details_json'
  ];
  ensureHeaders_(target, headers);

  var values = source.getDataRange().getValues();
  var rowsToDelete = [];
  for (var i = 1; i < values.length; i += 1) {
    var row = values[i];
    var notes = String(row[4] || '');
    var looksLikeMmmf =
      notes.indexOf('Program: Ready for Real Life Instruction and Education') !== -1 ||
      notes.indexOf('Program: Modern Manners and Mental Fortitude') !== -1 ||
      notes.indexOf('Source: mmmf-github-pages-registration-form') !== -1;
    if (!looksLikeMmmf) continue;

    var parsed = parseDetailedNotes_(notes);
    target.appendRow([
      row[5] || '',
      row[0] || '',
      row[1] || '',
      row[2] || '',
      row[3] || '',
      'Ready for Real Life Instruction and Education',
      parsed.organization || '',
      parsed.location || '',
      parsed.referral || '',
      parsed.tracks || '',
      parsed.delivery || '',
      parsed.start_date || '',
      parsed.class_size || '',
      parsed.training_status || '',
      parsed.population || '',
      parsed.gaps_identified || '',
      parsed.sel_confidence || '',
      parsed.support_needed || '',
      parsed.additional_notes || '',
      notes,
      ''
    ]);
    rowsToDelete.push(i + 1);
  }

  rowsToDelete.reverse().forEach(function(rowNumber) {
    source.deleteRow(rowNumber);
  });
}

function parseDetailedNotes_(notes) {
  return String(notes || '').split(' | ').reduce(function(acc, part) {
    var idx = part.indexOf(':');
    if (idx === -1) return acc;
    var key = part.slice(0, idx).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
    var value = part.slice(idx + 1).trim();
    acc[key] = value;
    return acc;
  }, {});
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
