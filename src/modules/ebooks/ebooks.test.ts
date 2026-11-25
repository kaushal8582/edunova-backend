import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { UserRole, BookStatus } from '../shared/constants';
import { Book } from './models/book.model';
import { BookAccess } from './models/book-access.model';
import { BookVersion } from './models/book-version.model';
import { User } from '../users/models/user.model';
import { getObjectStorage, setObjectStorage, LocalObjectStorage } from '../../infrastructure/storage';
import {
  buildApp,
  createUserDirect,
  expectFail,
  expectOk,
  login,
  registerAndVerify,
} from '../../test/helpers';

describe('eBook management', () => {
  const app = buildApp();

  it('creates books, rejects duplicate slugs, and blocks viewers from admin create', async () => {
    const password = 'Str0ng!Pass';
    await createUserDirect({
      email: 'ebook-super@example.com',
      password,
      role: UserRole.SUPER_ADMIN,
    });
    const adminLogin = await login(app, 'ebook-super@example.com', password);

    const created = await request(app)
      .post('/api/v1/admin/books')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`)
      .send({
        title: 'Physics Class 11',
        authors: ['HC Verma'],
        accessType: 'FREE',
        educationLevels: ['SCHOOL'],
      });
    expectOk(created, 201);
    expect(created.body.data.slug).toContain('physics');

    const dup = await request(app)
      .post('/api/v1/admin/books')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`)
      .send({
        title: 'Other',
        slug: created.body.data.slug,
        authors: ['A'],
      });
    expectFail(dup, 409);

    const viewer = await registerAndVerify(app, { email: 'ebook-viewer@example.com' });
    const viewerLogin = await login(app, viewer.email, viewer.password);
    const denied = await request(app)
      .post('/api/v1/admin/books')
      .set('Authorization', `Bearer ${viewerLogin.body.data.accessToken}`)
      .send({ title: 'Nope', authors: ['X'] });
    expectFail(denied, 403);
  });

  it('supports version upload completion with local storage and publish flow', async () => {
    setObjectStorage(new LocalObjectStorage(`${process.cwd()}/.storage-test`));
    const password = 'Str0ng!Pass';
    await createUserDirect({
      email: 'ebook-content@example.com',
      password,
      role: UserRole.CONTENT_ADMIN,
    });
    const adminLogin = await login(app, 'ebook-content@example.com', password);
    const token = adminLogin.body.data.accessToken as string;

    const bookRes = await request(app)
      .post('/api/v1/admin/books')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Organic Chemistry',
        authors: ['Morrison'],
        accessType: 'FREE',
      });
    expectOk(bookRes, 201);
    const bookId = bookRes.body.data.id as string;

    const versionRes = await request(app)
      .post(`/api/v1/admin/books/${bookId}/versions`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expectOk(versionRes, 201);
    const versionId = versionRes.body.data.id as string;

    const urls = await request(app)
      .post(`/api/v1/admin/books/${bookId}/versions/${versionId}/upload-urls`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        formats: [
          {
            format: 'PDF',
            originalFileName: 'chem.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 12,
          },
        ],
      });
    expectOk(urls, 200);
    const storageKey = urls.body.data.uploads[0].storageKey as string;

    // Simulate direct upload into local storage.
    const storage = getObjectStorage();
    await storage.putObject({
      key: storageKey,
      body: Buffer.from('%PDF-1.4 fake content for tests'),
      contentType: 'application/pdf',
    });

    const complete = await request(app)
      .post(`/api/v1/admin/books/${bookId}/versions/${versionId}/complete-upload`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        formats: [{ format: 'PDF', storageKey }],
      });
    expectOk(complete, 200);

    // Reject invalid storage key ownership
    const badKey = await request(app)
      .post(`/api/v1/admin/books/${bookId}/versions/${versionId}/complete-upload`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        formats: [
          {
            format: 'PDF',
            storageKey: 'books/other/versions/x/PDF/file.pdf',
          },
        ],
      });
    expectFail(badKey, 400);

    // Manual chapter + approve path for publish with REQUIRE_CHAPTER_APPROVAL false in tests
    const chapter = await request(app)
      .post(`/api/v1/admin/books/${bookId}/versions/${versionId}/chapters`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Introduction',
        chapterNumber: 1,
        order: 1,
        level: 1,
        formatLocations: { pdf: { startPage: 1, endPage: 2 } },
      });
    expectOk(chapter, 201);

    const publish = await request(app)
      .post(`/api/v1/admin/books/${bookId}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ versionId });
    expectOk(publish, 200);
    expect(publish.body.data.status).toBe(BookStatus.PUBLISHED);

    const catalogue = await request(app).get('/api/v1/books');
    expectOk(catalogue, 200);
    expect(catalogue.body.data.items.some((b: { id: string }) => b.id === bookId)).toBe(true);
  });

  it('hides unpublished books from viewers and enforces premium access', async () => {
    const password = 'Str0ng!Pass';
    await createUserDirect({
      email: 'ebook-admin2@example.com',
      password,
      role: UserRole.SUPER_ADMIN,
    });
    const adminLogin = await login(app, 'ebook-admin2@example.com', password);
    const token = adminLogin.body.data.accessToken as string;

    const draft = await request(app)
      .post('/api/v1/admin/books')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Draft Only', authors: ['A'], accessType: 'FREE' });
    expectOk(draft, 201);

    const viewer = await registerAndVerify(app, { email: 'premium-viewer@example.com' });
    const viewerLogin = await login(app, viewer.email, viewer.password);
    const viewerToken = viewerLogin.body.data.accessToken as string;

    const hidden = await request(app).get(`/api/v1/books/${draft.body.data.id}`);
    expectFail(hidden, 404);

    const premium = await request(app)
      .post('/api/v1/admin/books')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Premium Book', authors: ['P'], accessType: 'PREMIUM' });
    expectOk(premium, 201);
    const premiumId = premium.body.data.id as string;

    await Book.updateOne(
      { _id: premiumId },
      { $set: { status: BookStatus.PUBLISHED, publishedAt: new Date() } }
    );

    const openDenied = await request(app)
      .post(`/api/v1/books/${premiumId}/open`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ format: 'PDF' });
    expectFail(openDenied, 403);

    const viewerUser = await User.findOne({ email: viewer.email }).lean();
    await BookAccess.create({
      userId: viewerUser!._id,
      bookId: premiumId,
      accessType: 'PREMIUM',
      source: 'ADMIN_GRANT',
    });

    // Still fails without a published version/format file — entitlement alone is not enough.
    const openStillBlocked = await request(app)
      .post(`/api/v1/books/${premiumId}/open`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ format: 'PDF' });
    expect([400, 404]).toContain(openStillBlocked.status);
  });

  it('enforces bookmark and annotation ownership', async () => {
    const password = 'Str0ng!Pass';
    const a = await registerAndVerify(app, { email: 'owner-a@example.com' });
    const b = await registerAndVerify(app, { email: 'owner-b@example.com' });
    const loginA = await login(app, a.email, a.password);
    const loginB = await login(app, b.email, b.password);

    await createUserDirect({
      email: 'ebook-admin3@example.com',
      password,
      role: UserRole.SUPER_ADMIN,
    });
    const adminLogin = await login(app, 'ebook-admin3@example.com', password);
    const bookRes = await request(app)
      .post('/api/v1/admin/books')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`)
      .send({ title: 'Owned Book', authors: ['Z'], accessType: 'FREE' });
    expectOk(bookRes, 201);
    const bookId = bookRes.body.data.id as string;
    await Book.updateOne(
      { _id: bookId },
      { $set: { status: BookStatus.PUBLISHED, publishedAt: new Date() } }
    );

    const version = await BookVersion.create({
      bookId,
      versionNumber: 1,
      formats: [
        {
          format: 'PDF',
          storageKey: `books/${bookId}/versions/x/PDF/a.pdf`,
          sizeBytes: 10,
          mimeType: 'application/pdf',
        },
      ],
      processingStatus: 'COMPLETED',
      createdBy: bookRes.body.data.createdBy,
    });
    await Book.updateOne({ _id: bookId }, { $set: { currentVersionId: version._id } });

    const bm = await request(app)
      .post(`/api/v1/me/books/${bookId}/bookmarks`)
      .set('Authorization', `Bearer ${loginA.body.data.accessToken}`)
      .send({
        bookVersionId: version._id.toString(),
        format: 'PDF',
        location: { page: 3 },
        label: 'Important',
      });
    expectOk(bm, 201);

    const steal = await request(app)
      .delete(`/api/v1/me/bookmarks/${bm.body.data.id}`)
      .set('Authorization', `Bearer ${loginB.body.data.accessToken}`);
    expectFail(steal, 404);

    const ann = await request(app)
      .post(`/api/v1/me/books/${bookId}/annotations`)
      .set('Authorization', `Bearer ${loginA.body.data.accessToken}`)
      .send({
        bookVersionId: version._id.toString(),
        format: 'PDF',
        selectedText: 'Bonding',
        color: 'yellow',
        anchor: { page: 3, startOffset: 0, endOffset: 7 },
      });
    expectOk(ann, 201);

    const stealAnn = await request(app)
      .delete(`/api/v1/me/annotations/${ann.body.data.id}`)
      .set('Authorization', `Bearer ${loginB.body.data.accessToken}`);
    expectFail(stealAnn, 404);
  });
});
