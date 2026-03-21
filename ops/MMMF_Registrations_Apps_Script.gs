function doPost(e) {
  try {
    var payload = parsePayload_(e);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

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
    payload.program || 'Modern Manners and Mental Fortitude',
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

  var subject = payload.notification_subject || 'New MMMF registration submission';
  var body = [
    'A new MMMF registration was submitted.',
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
    var looksLikeMmmf = notes.indexOf('Program: Modern Manners and Mental Fortitude') !== -1 || notes.indexOf('Source: mmmf-github-pages-registration-form') !== -1;
    if (!looksLikeMmmf) continue;

    var parsed = parseDetailedNotes_(notes);
    target.appendRow([
      row[5] || '',
      row[0] || '',
      row[1] || '',
      row[2] || '',
      row[3] || '',
      'Modern Manners and Mental Fortitude',
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
