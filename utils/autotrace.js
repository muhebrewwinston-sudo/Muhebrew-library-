/**
 * Auto-Trace File Details Utility for Malawi Secondary Educational Resources
 * Intelligently extracts: Title, Type (paper/book), Subject, Level, Category, Year, Exam Board, Author
 */

function autoTraceFile(filename, fileSize = 0) {
  const ext = filename.lastIndexOf('.') !== -1 ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : '';
  const base = filename.slice(0, filename.length - ext.length);
  // Clean separators: replace underscores, hyphens, and multiple spaces
  const cleanName = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const lower = cleanName.toLowerCase();

  // 1. Detect Year (4 digits: 1990 - 2030)
  const yearMatch = cleanName.match(/\b(199\d|20[0-3]\d)\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

  // 2. Detect Resource Type (papers vs books)
  const isBook = /\b(textbook|book|guide|handbook|syllabus|curriculum|module)\b/i.test(lower) && 
                 !/\b(paper|exam|marking key|marking scheme|mock|scheme|test)\b/i.test(lower);
  const type = isBook ? 'books' : 'papers';

  // 3. Detect Malawi Secondary School Subject
  const subjects = [
    { name: 'Mathematics', regex: /\b(mathematics|maths|math)\b/i },
    { name: 'English', regex: /\b(english|eng)\b/i },
    { name: 'Chichewa', regex: /\b(chichewa|chinyanja|chi)\b/i },
    { name: 'Biology', regex: /\b(biology|bio)\b/i },
    { name: 'Physical Science', regex: /\b(physical\s*science|phys\s*sci)\b/i },
    { name: 'Physics', regex: /\b(physics)\b/i },
    { name: 'Chemistry', regex: /\b(chemistry|chem)\b/i },
    { name: 'Agriculture', regex: /\b(agriculture|agric|agri)\b/i },
    { name: 'Geography', regex: /\b(geography|geo)\b/i },
    { name: 'History', regex: /\b(history|hist)\b/i },
    { name: 'Social Studies', regex: /\b(social\s*studies|social)\b/i },
    { name: 'Life Skills', regex: /\b(life\s*skills|lifeskills)\b/i },
    { name: 'Computer Studies', regex: /\b(computer\s*studies|computer\s*science|computing|ict)\b/i },
    { name: 'Bible Knowledge', regex: /\b(bible\s*knowledge|religious\s*education|bk|b\.k)\b/i },
    { name: 'Business Studies', regex: /\b(business\s*studies|business)\b/i },
    { name: 'Commerce', regex: /\b(commerce)\b/i },
    { name: 'Home Economics', regex: /\b(home\s*economics|nutrition)\b/i },
    { name: 'French', regex: /\b(french|français)\b/i }
  ];

  let detectedSubject = 'General Studies';
  for (const s of subjects) {
    if (s.regex.test(lower)) {
      detectedSubject = s.name;
      break;
    }
  }

  // 4. Detect Class Level (Form 1 to Form 4)
  let detectedLevel = 'Form 4';
  if (/\b(form\s*1|f1|f\s*1|std\s*8)\b/i.test(lower)) {
    detectedLevel = 'Form 1';
  } else if (/\b(form\s*2|f2|f\s*2)\b/i.test(lower)) {
    detectedLevel = 'Form 2';
  } else if (/\b(form\s*3|f3|f\s*3)\b/i.test(lower)) {
    detectedLevel = 'Form 3';
  } else if (/\b(form\s*4|f4|f\s*4)\b/i.test(lower)) {
    detectedLevel = 'Form 4';
  } else if (/\bjce\b/i.test(lower)) {
    detectedLevel = 'Form 2'; // Junior Certificate of Education terminal level
  } else if (/\bmsce\b/i.test(lower)) {
    detectedLevel = 'Form 4'; // Malawi School Certificate of Education terminal level
  }

  // 5. Detect Category (MANEB, Mock, Marking Key, Notes, MSCE, JCE)
  let detectedCategory = 'MANEB';
  if (/\b(marking\s*key|marking\s*scheme|answers|solutions|memo)\b/i.test(lower)) {
    detectedCategory = 'Marking Key';
  } else if (/\b(notes|summary|revision|handout|pamphlet)\b/i.test(lower)) {
    detectedCategory = 'Notes';
  } else if (/\b(mock|cluster|division|zone)\b/i.test(lower)) {
    detectedCategory = 'Mock';
  } else if (isBook) {
    detectedCategory = (detectedLevel === 'Form 1' || detectedLevel === 'Form 2') ? 'JCE' : 'MSCE';
  } else if (/\bjce\b/i.test(lower)) {
    detectedCategory = 'JCE';
  } else if (/\bmsce\b/i.test(lower)) {
    detectedCategory = 'MSCE';
  }

  // 6. Detect Exam Board / Division
  let detectedBoard = 'MANEB';
  if (/\bmock\b/i.test(lower) || detectedCategory === 'Mock') {
    detectedBoard = 'Mock';
  } else if (/\bcluster\b/i.test(lower)) {
    detectedBoard = 'Cluster Mock';
  } else if (/\bdivision\b/i.test(lower)) {
    detectedBoard = 'Division Mock';
  }

  // 7. Detect Author / Publisher (if textbook)
  let detectedAuthor = '';
  if (/\bexcel\b/i.test(lower)) detectedAuthor = 'Excel & Succeed';
  else if (/\blonghorn\b/i.test(lower)) detectedAuthor = 'Longhorn Publishers';
  else if (/\bmie\b/i.test(lower)) detectedAuthor = 'Malawi Institute of Education (MIE)';
  else if (/\bministry\b/i.test(lower)) detectedAuthor = 'Ministry of Education';
  else if (isBook) detectedAuthor = 'Ministry of Education';

  // 8. Generate Clean, Well-Formatted Title
  let cleanTitle = cleanName.split(' ').map((word) => {
    const w = word.trim();
    if (!w) return '';
    const upper = w.toUpperCase();
    if (['MSCE', 'JCE', 'MANEB', 'PDF', 'MIE', 'CWED', 'SEED', 'NED', 'SHED', 'SWED'].includes(upper)) return upper;
    if (['and', 'of', 'in', 'for', 'the', 'to', 'on', 'with', 'at'].includes(w.toLowerCase())) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');

  return {
    rawName: filename,
    fileSize,
    type,
    title: cleanTitle,
    subject: detectedSubject,
    level: detectedLevel,
    year: isBook ? null : year,
    category: detectedCategory,
    exam_board: isBook ? null : detectedBoard,
    author: detectedAuthor,
    description: isBook
      ? `Malawi Secondary School curriculum textbook for ${detectedLevel} ${detectedSubject}.`
      : `${detectedLevel} ${detectedSubject} (${detectedCategory}) educational resource.`
  };
}

module.exports = { autoTraceFile };
