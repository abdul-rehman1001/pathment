'use strict';

/**
 * Regression guard for the phone voice answer.
 *
 * A browser records webm and always got through. A phone records AAC in an MP4
 * container — `answer.m4a`, sent as one of four mime types depending on the
 * device — and none of them were on the list, so every voice answer from the
 * mobile app died at the upload with "File type not supported" after the mentee
 * had already spoken it. Nothing about the interview said which half had failed.
 */

const upload = require('../../src/middlewares/upload');

const accepts = (originalname, mimetype) =>
  new Promise((resolve) => {
    upload.fileFilter({}, { originalname, mimetype }, (err, ok) => resolve(!err && ok === true));
  });

describe('what an interview voice answer may be recorded as', () => {
  it.each([
    ['answer.m4a', 'audio/m4a'],
    ['answer.m4a', 'audio/x-m4a'],
    ['answer.m4a', 'audio/mp4'],
    ['answer.m4a', 'application/octet-stream'], // some devices say nothing useful
    ['answer.aac', 'audio/aac'],
    ['answer.3gp', 'audio/3gpp'],
    ['answer.caf', 'audio/x-caf'],
    ['answer.amr', 'audio/amr'],
  ])('accepts %s sent as %s', async (name, mime) => {
    await expect(accepts(name, mime)).resolves.toBe(true);
  });

  it('still accepts what the browser sends', async () => {
    await expect(accepts('answer.webm', 'audio/webm')).resolves.toBe(true);
    await expect(accepts('answer.wav', 'audio/wav')).resolves.toBe(true);
    await expect(accepts('answer.mp3', 'audio/mpeg')).resolves.toBe(true);
  });

  it('still accepts a proctor snapshot', async () => {
    await expect(accepts('snapshot.jpg', 'image/jpeg')).resolves.toBe(true);
  });

  it('still refuses something that is not a file anyone should be uploading', async () => {
    await expect(accepts('payload.exe', 'application/x-msdownload')).resolves.toBe(false);
    await expect(accepts('run.sh', 'application/x-sh')).resolves.toBe(false);
  });
});
