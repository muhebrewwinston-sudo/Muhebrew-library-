/**
 * Accurate auto-trace for Malawi secondary school resources
 * Reads clues from filename (and optional title text) — does NOT guess Form 4 for everything.
 */
function autoTraceFile(filename, fileSize = 0) {
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : '';
  const base = filename.slice(0, filename.length - (ext.length || 0));
  const clean = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const lower = clean.toLowerCase();

  // Year: prefer 1990–2035
  let year = null;
  const yearMatch = clean.match(/\b(19[9]\d|20[0-3]\d)\b/);
  if (yearMatch) year = parseInt(yearMatch[1], 10);

  // Type: book vs paper
  const isMarking = /\b(marking\s*key|marking\s*scheme|mark\s*scheme|ms\b|answers?)\b/i.test(lower);
  const isBook = !isMarking && /\b(textbook|student'?s?\s*book|pupils?\s*book|handbook|module|notes?)\b/i.test(lower)
    && !/\b(paper|exam|mock|test|maneb)\b/i.test(lower);
  const type = isBook ? 'books' : 'papers';

  // Subject
  const subjectRules = [
    [/physical\s*science|phys\s*sci|p\/s/i, 'Physical Science'],
    [/\bphysics|phys|phy\b/i, 'Physics'],
    [/\bchemistry|chem|chm\b/i, 'Chemistry'],
    [/\bbiology|biol?|bio\b/i, 'Biology'],
    [/\bmathematics|maths?|calc|algebra|geometry|mth\b/i, 'Mathematics'],
    [/\benglish|grammar|literature|eng\b/i, 'English'],
    [/\bchichewa|chi\s*chewa|chinyanja|chic|chich\b/i, 'Chichewa'],
    [/\bgeography|geog?|geo\b/i, 'Geography'],
    [/\bhistory|hist\b/i, 'History'],
    [/\bagriculture|agric?|agr\b/i, 'Agriculture'],
    [/\bsocial\s*studies|social|soc\b/i, 'Social Studies'],
    [/\blife\s*skills|life|ls\b/i, 'Life Skills'],
    [/\bcomputer|ict|computing|cs\b/i, 'Computer Studies'],
    [/\bbible|bk|religious|cre\b/i, 'Bible Knowledge'],
    [/\bbusiness|bus|biz\b/i, 'Business Studies'],
    [/\bcommerce|comm\b/i, 'Commerce'],
    [/\bhome\s*economics|nutrition|he\b/i, 'Home Economics'],
    [/\bfrench\b/i, 'French']
  ];
  let subject = 'General';
  for (const [re, name] of subjectRules) {
    if (re.test(lower)) { subject = name; break; }
  }

  // Level — accurate matching (do not invent Form 4 blindly)
  let level = null;
  if (/\bform\s*4\b|\bf4\b|\bform-4\b|\bmsce\b|\bgrade\s*12\b/i.test(lower)) level = 'Form 4';
  else if (/\bform\s*3\b|\bf3\b|\bform-3\b|\bgrade\s*11\b/i.test(lower)) level = 'Form 3';
  else if (/\bform\s*2\b|\bf2\b|\bform-2\b|\bjce\b|\bgrade\s*10\b/i.test(lower)) level = 'Form 2';
  else if (/\bform\s*1\b|\bf1\b|\bform-1\b|\bgrade\s*9\b/i.test(lower)) level = 'Form 1';

  // Category / exam board — MANEB only when official MANEB is indicated
  let category = null;
  let exam_board = null;
  let school = null;

  const isMock = /\bmock\b|\bcluster\b|\bdivision\s*exam\b|\btrial\b/i.test(lower);
  const isManeb = /\bmaneb\b/.test(lower);
  const isJce = /\bjce\b|\bjunior\s*certificate\b/i.test(lower);
  const isMsce = /\bmsce\b|\bmalawi\s*school\s*certificate\b/i.test(lower);

  if (isMarking) {
    category = 'Marking Key';
    if (isManeb) exam_board = 'MANEB';
    else if (isMock) exam_board = 'Mock';
    else if (isJce) exam_board = 'JCE';
    else if (isMsce) exam_board = 'MSCE';
  } else if (isMock) {
    category = 'Mock';
    exam_board = 'Mock';
    // Try school name: text before "mock" or after school keywords
    const schoolMatch = clean.match(/(?:^|[\s\-])([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})\s+(?:Secondary|High|School|Mock)/);
    const schoolMatch2 = clean.match(/^([A-Za-z][A-Za-z\s]{2,40}?)\s+mock/i);
    if (schoolMatch) school = schoolMatch[1].trim();
    else if (schoolMatch2) school = schoolMatch2[1].trim();
  } else if (isManeb) {
    category = 'MANEB';
    exam_board = 'MANEB';
  } else if (isJce) {
    category = 'JCE';
    exam_board = 'JCE';
  } else if (isMsce) {
    category = 'MSCE';
    exam_board = 'MSCE';
  } else if (isBook) {
    category = /\bnotes?\b/i.test(lower) ? 'Notes' : 'Textbook';
  } else {
    // Unknown paper — do NOT label as MANEB
    category = 'Past Paper';
    exam_board = null;
  }

  // Soft level from JCE/MSCE only as band label when form not specified
  if (!level) {
    if (isJce) level = 'Form 1–2 (JCE)';
    else if (isMsce) level = 'Form 3–4 (MSCE)';
    else if (year && year <= 2010) level = null; // leave unknown
    else level = null;
  }

  // Paper number
  let paper_no = null;
  const pMatch = lower.match(/\b(?:paper|p|pp)\s*([1-4ivx]+)\b/i);
  if (pMatch) paper_no = 'Paper ' + pMatch[1].toUpperCase();

  // Title: clean, human readable, reflect cover-style naming
  let title = clean;
  // Remove file junk
  title = title.replace(/\b(pdf|docx?|final|copy|scan)\b/ig, '').replace(/\s+/g, ' ').trim();
  if (isMarking && !/marking/i.test(title)) title = title + ' Marking Key';
  if (school && isMock && !new RegExp(school, 'i').test(title)) {
    title = school + ' Mock — ' + (subject !== 'General' ? subject + ' ' : '') + (year || '') + (paper_no ? ' ' + paper_no : '');
    title = title.replace(/\s+/g, ' ').trim();
  }

  // Remove trailing (Form 4), (Form 1..4), etc. from title
  title = title.replace(/\s*\(\s*Form\s*[1-4]\s*\)\s*$/i, '').replace(/\s+Form\s*[1-4]\s*$/i, '').trim();

  if (title.length < 3) title = base;
  if (title.length > 140) title = title.slice(0, 140);

  return {
    title,
    type,
    subject,
    level, // may be null — UI should not show fake Form 4
    category,
    exam_board,
    year,
    paper_no,
    school,
    author: isBook ? null : null,
    description: school ? ('School: ' + school) : '',
    fileSize
  };
}

module.exports = { autoTraceFile };
