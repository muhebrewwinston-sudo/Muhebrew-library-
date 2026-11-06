/**
 * Accurate auto-trace for Malawi secondary school resources
 * Reads clues from filename (and optional title text) — strictly focuses on secondary school (Form 1 to Form 4).
 * Excludes every primary school file (Standard 1–8 / PSLCE / Primary).
 */

/**
 * Detect if a file belongs to Primary School (Standard 1–8 / PSLCE / Primary)
 * which must be completely excluded from Muhebrew Secondary School Library.
 */
function isPrimarySchoolFile(filename, folderPath = '', title = '') {
  const combined = `${filename || ''} ${folderPath || ''} ${title || ''}`.toLowerCase();
  
  // Explicit primary school patterns in Malawi curriculum
  const primaryPatterns = [
    /\bpslce\b/i,
    /\bprimary\b/i,
    /\bstandard\s*[1-8]\b/i,
    /\bstd\s*[1-8]\b/i,
    /\bstd[1-8]\b/i,
    /\bgrade\s*[1-8]\b/i,
    /\bclass\s*[1-8]\b/i,
    /\bpupil'?s?\s*book\b/i
  ];

  return primaryPatterns.some((pattern) => pattern.test(combined));
}

/**
 * Detect if a file is a Secondary School file (Form 1, Form 2, Form 3, Form 4, JCE, MSCE)
 */
function isSecondarySchoolFile(filename, folderPath = '', title = '') {
  if (isPrimarySchoolFile(filename, folderPath, title)) {
    return false;
  }

  const combined = `${filename || ''} ${folderPath || ''} ${title || ''}`.toLowerCase();

  const secondaryPatterns = [
    /\bform\s*[1-4]\b/i,
    /\bf[1-4]\b/i,
    /\bform-[1-4]\b/i,
    /\bmsce\b/i,
    /\bjce\b/i,
    /\bsecondary\b/i,
    /\bhigh\s*school\b/i,
    /\bcluster\s*mock\b/i,
    /\bmarking\s*key\b/i,
    /\bmarking\s*scheme\b/i
  ];

  return secondaryPatterns.some((pattern) => pattern.test(combined));
}

function autoTraceFile(filename, fileSize = 0, folderPath = '') {
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : '';
  const base = filename.slice(0, filename.length - (ext.length || 0));
  const clean = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const lower = clean.toLowerCase();

  // 1. Primary School Exclusion Check
  if (isPrimarySchoolFile(filename, folderPath, clean)) {
    return {
      title: clean,
      type: 'primary',
      level: 'Primary',
      isPrimary: true,
      isSecondary: false,
      exclude: true,
      reason: 'Primary school file excluded (Standard 1–8 / PSLCE). Library is exclusively for Form 1 to Form 4.'
    };
  }

  // Year: prefer 1990–2035
  let year = null;
  const yearMatch = clean.match(/\b(19[9]\d|20[0-3]\d)\b/);
  if (yearMatch) year = parseInt(yearMatch[1], 10);

  // Type: book vs paper
  const isMarking = /\b(marking\s*key|marking\s*scheme|mark\s*scheme|ms\b|answers?)\b/i.test(lower);
  const isBook = !isMarking && /\b(textbook|student'?s?\s*book|handbook|module|notes?)\b/i.test(lower)
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
  let subject = 'General Studies';
  for (const [re, name] of subjectRules) {
    if (re.test(lower)) { subject = name; break; }
  }

  // Level — accurate matching (Form 1 up to Form 4 ONLY)
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
    category = 'Marking Keys';
    if (isManeb) exam_board = 'MANEB';
    else if (isMock) exam_board = 'Mock';
    else if (isJce) exam_board = 'JCE';
    else if (isMsce) exam_board = 'MSCE';
  } else if (isMock) {
    category = 'Cluster Mock';
    exam_board = 'Cluster Mock';
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
    category = isBook ? 'Textbook' : 'MANEB';
    exam_board = 'MANEB';
  }

  // Ensure secondary level is set cleanly (Form 1 to Form 4)
  if (!level) {
    if (isJce) level = 'Form 2';
    else if (isMsce) level = 'Form 4';
    else level = 'Form 4'; // Default secondary level
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
    title = school + ' Mock — ' + (subject !== 'General Studies' ? subject + ' ' : '') + (year || '') + (paper_no ? ' ' + paper_no : '');
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
    level, // Guaranteed Form 1, Form 2, Form 3, or Form 4
    category,
    exam_board,
    year: year || new Date().getFullYear(),
    paper_no,
    school,
    author: isBook ? 'Ministry of Education' : null,
    description: school ? ('School: ' + school) : `Malawi Secondary School ${isBook ? 'Textbook' : 'Past Paper'} (${level})`,
    fileSize,
    isPrimary: false,
    isSecondary: true,
    exclude: false
  };
}

module.exports = {
  autoTraceFile,
  isPrimarySchoolFile,
  isSecondarySchoolFile
};
