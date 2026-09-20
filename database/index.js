const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

const dbEnvPath = require('fs').existsSync(path.resolve(__dirname, '../.env'))
  ? path.resolve(__dirname, '../.env')
  : path.resolve(__dirname, '../../.env');
dotenv.config({ path: dbEnvPath });

const { Schema } = mongoose;
const modelCache = new Map();

const collections = {
  lead: 'leads', admin: 'admins', user: 'users', enrollment: 'enrollments',
  studentProfile: 'student_profiles', studentDocument: 'student_documents',
  course: 'courses', batch: 'batches', classSession: 'class_sessions',
  attendance: 'attendance', notification: 'notifications', certificate: 'certificates',
  event: 'events', quizQuestion: 'quiz_questions', quizAttempt: 'quiz_attempts',
  eventRegistration: 'event_registrations', pageContent: 'page_contents',
  blogCategory: 'blog_categories', blog: 'blogs', testimonial: 'testimonials', admission: 'admissions',
  placement: 'placements', coupon: 'coupons', referral: 'referrals', payment: 'payments',
  adminAuditLog: 'admin_audit_logs', paymentSetting: 'payment_settings', expense: 'expenses',
  additionalIncome: 'additional_incomes', emailAccount: 'email_accounts', hrContact: 'hr_contacts',
  hrCampaign: 'hr_campaigns', hRCampaign: 'hr_campaigns', hrCampaignRecipient: 'hr_campaign_recipients', hRCampaignRecipient: 'hr_campaign_recipients',
  hrCvAttachment: 'hr_cv_attachments', hRCVAttachment: 'hr_cv_attachments', hRContact: 'hr_contacts', lmsContent: 'lms_contents', lMSContent: 'lms_contents', batchMentor: 'batch_mentors',
  contentDeleteRequest: 'content_delete_requests', studentReviewVideo: 'student_review_videos',
  assignment: 'assignments', assignmentSubmission: 'assignment_submissions', batchExam: 'batch_exams',
  examQuestion: 'exam_questions', examSubmission: 'exam_submissions', examAnswer: 'exam_answers',
  coordinatorCommission: 'coordinator_commissions', coordinatorPaySlip: 'coordinator_pay_slips',
  mentorPayout: 'mentor_payouts'
};

// MongoDB references created by the SQLite migration. These let existing API
// responses retain their nested data without relying on an ORM.
const relations = {
  batch: { course: ['one', 'course', 'courseId'], enrollments: ['many', 'enrollment', 'batchId'], lmsContents: ['many', 'lMSContent', 'batchId'], batchMentors: ['many', 'batchMentor', 'batchId'] },
  batchMentor: { batch: ['one', 'batch', 'batchId'], mentor: ['one', 'admin', 'mentorId'] },
  classSession: { batch: ['one', 'batch', 'batchId'], mentor: ['one', 'admin', 'mentorId'], attendances: ['many', 'attendance', 'classSessionId'] },
  attendance: { user: ['one', 'user', 'userId'], session: ['one', 'classSession', 'classSessionId'] },
  enrollment: { user: ['one', 'user', 'userId'], batch: ['one', 'batch', 'batchId'] },
  payment: { user: ['one', 'user', 'userId'] }, lMSContent: { batch: ['one', 'batch', 'batchId'] },
  contentDeleteRequest: { content: ['one', 'lMSContent', 'contentId'], mentor: ['one', 'admin', 'mentorId'] },
  assignment: { batch: ['one', 'batch', 'batchId'], mentor: ['one', 'admin', 'mentorId'], submissions: ['many', 'assignmentSubmission', 'assignmentId'] },
  assignmentSubmission: { assignment: ['one', 'assignment', 'assignmentId'], user: ['one', 'user', 'userId'] },
  batchExam: { batch: ['one', 'batch', 'batchId'], mentor: ['one', 'admin', 'mentorId'], questions: ['many', 'examQuestion', 'examId'], submissions: ['many', 'examSubmission', 'examId'] },
  examQuestion: { exam: ['one', 'batchExam', 'examId'], answers: ['many', 'examAnswer', 'questionId'] },
  examSubmission: { exam: ['one', 'batchExam', 'examId'], user: ['one', 'user', 'userId'], answers: ['many', 'examAnswer', 'submissionId'] },
  examAnswer: { submission: ['one', 'examSubmission', 'submissionId'], question: ['one', 'examQuestion', 'questionId'] },
  event: { questions: ['many', 'quizQuestion', 'eventId'] }, quizQuestion: { event: ['one', 'event', 'eventId'] }, quizAttempt: { event: ['one', 'event', 'eventId'] },
  hRCampaign: { emailAccount: ['one', 'emailAccount', 'emailAccountId'], recipients: ['many', 'hRCampaignRecipient', 'campaignId'], attachments: ['many', 'hRCVAttachment', 'campaignId'] },
  hRCampaignRecipient: { campaign: ['one', 'hRCampaign', 'campaignId'], hrContact: ['one', 'hRContact', 'hrContactId'] },
  hRCVAttachment: { campaign: ['one', 'hRCampaign', 'campaignId'] }
};

function connect() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not configured');
  if (mongoose.connection.readyState === 0) {
    mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 })
      .then(() => console.log(`MongoDB connected: ${mongoose.connection.name}`))
      .catch((error) => console.error('MongoDB connection failed:', error.message));
  }
  return mongoose.connection.asPromise();
}

function asPlain(document) {
  if (!document) return document;
  const value = document.toObject ? document.toObject() : document;
  const { _id, __v, ...rest } = value;
  return { ...rest, id: String(_id) };
}

function mongoWhere(where = {}) {
  const query = {};
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;
    const field = key === 'id' ? '_id' : key;
    const normalizedValue = field === '_id' && typeof value === 'string' && mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : value;
    if (key.includes('_') && value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(query, mongoWhere(normalizedValue));
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      const operators = {};
      if ('in' in value) operators.$in = value.in;
      if ('notIn' in value) operators.$nin = value.notIn;
      if ('lt' in value) operators.$lt = value.lt;
      if ('lte' in value) operators.$lte = value.lte;
      if ('gt' in value) operators.$gt = value.gt;
      if ('gte' in value) operators.$gte = value.gte;
      if ('contains' in value) operators.$regex = value.contains, operators.$options = 'i';
      if ('equals' in normalizedValue) query[field] = normalizedValue.equals;
      else if (Object.keys(operators).length) query[field] = operators;
      else query[field] = normalizedValue;
    } else query[field] = normalizedValue;
  }
  return query;
}

function mongoUpdate(data = {}) {
  const set = {}, inc = {};
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && ('increment' in value || 'decrement' in value)) {
      inc[key] = value.increment ?? -value.decrement;
    } else set[key] = value;
  }
  return { ...(Object.keys(set).length && { $set: set }), ...(Object.keys(inc).length && { $inc: inc }) };
}

function applySelect(row, select) {
  return select ? Object.fromEntries(Object.keys(select).filter(key => select[key]).map(key => [key, row[key]])) : row;
}

async function addIncludes(modelName, row, include) {
  if (!include || !row) return row;
  const hydrated = { ...row };
  for (const [name, options] of Object.entries(include)) {
    if (name === '_count') {
      hydrated._count = {};
      for (const relationName of Object.keys(options.select || {})) {
        const relation = relations[modelName]?.[relationName];
        if (relation?.[0] === 'many') hydrated._count[relationName] = await delegate(relation[1]).count({ where: { [relation[2]]: row.id } });
      }
      continue;
    }
    const relation = relations[modelName]?.[name];
    if (!relation) continue;
    const [kind, target, field] = relation;
    const nested = options === true ? {} : options;
    hydrated[name] = kind === 'one'
      ? await delegate(target).findFirst({ where: { id: row[field] }, ...nested })
      : await delegate(target).findMany({ where: { [field]: row.id }, ...nested });
  }
  return hydrated;
}

function delegate(name) {
  if (modelCache.has(name)) return modelCache.get(name);
  const collection = collections[name];
  if (!collection) return undefined;
  const Model = mongoose.models[`Clinidea_${name}`] || mongoose.model(`Clinidea_${name}`, new Schema({}, { strict: false, collection, timestamps: true }));
  const api = {
    fields: new Proxy({}, { get: (_, key) => String(key) }),
    async findMany({ where, orderBy, take, skip, select, include } = {}) {
      let query = Model.find(mongoWhere(where));
      if (orderBy) {
        let sortObj = orderBy;
        if (Array.isArray(orderBy)) {
          sortObj = {};
          orderBy.forEach(item => {
            if (item && typeof item === 'object') {
              Object.assign(sortObj, item);
            }
          });
        }
        query = query.sort(sortObj);
      }
      if (Number.isInteger(skip)) query = query.skip(skip);
      if (Number.isInteger(take)) query = query.limit(take);
      const rows = await query.lean();
      return Promise.all(rows.map(asPlain).map(async row => applySelect(await addIncludes(name, row, include), select)));
    },
    async findFirst({ where, orderBy, select, include } = {}) { return (await api.findMany({ where, orderBy, take: 1, select, include }))[0] || null; },
    async findUnique({ where, select, include } = {}) { return api.findFirst({ where, select, include }); },
    async create({ data }) { return asPlain(await Model.create(data)); },
    async createMany({ data }) { const result = await Model.insertMany(data); return { count: result.length }; },
    async update({ where, data }) { const result = await Model.findOneAndUpdate(mongoWhere(where), mongoUpdate(data), { new: true }).lean(); if (!result) throw new Error(`${name} record not found`); return asPlain(result); },
    async updateMany({ where, data }) { const result = await Model.updateMany(mongoWhere(where), mongoUpdate(data)); return { count: result.modifiedCount }; },
    async delete({ where }) { const result = await Model.findOneAndDelete(mongoWhere(where)).lean(); if (!result) throw new Error(`${name} record not found`); return asPlain(result); },
    async deleteMany({ where } = {}) { const result = await Model.deleteMany(mongoWhere(where)); return { count: result.deletedCount }; },
    async count({ where } = {}) { return Model.countDocuments(mongoWhere(where)); },
    async upsert({ where, create, update }) { const existing = await Model.findOne(mongoWhere(where)); return existing ? api.update({ where, data: update }) : api.create({ data: create }); }
  };
  modelCache.set(name, api);
  return api;
}

const database = new Proxy({
  connect,
  $disconnect: () => mongoose.disconnect(),
  $transaction: async (work) => Array.isArray(work) ? Promise.all(work) : work(database)
}, { get(target, key) { return key in target ? target[key] : delegate(key); } });

// Open one shared connection for both the HTTP server and standalone backend scripts.
database.connect().catch(() => {});

module.exports = database;
