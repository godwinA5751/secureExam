import { Schema, model, Document, Types } from "mongoose";

export type QuestionGenMode = "ai" | "manual";
export type TestStatus = "draft" | "published";
export type TestWindow = "opened" | "closed";

export interface IRosterUploadLog {
  uploadedAt: Date;
  acceptedCount: number;
  rejectedCount: number;
  rejectedReasons: string[];
}

export interface IStudentLoginAttempt {
  idNumber: string;
  failedAttempts: number;
  lockedUntil?: Date | null;
}

export interface ITest extends Document {
  _id: Types.ObjectId;
  lecturerId: Types.ObjectId;
  title: string;
  topics: string[];
  loginWindowStart: Date;
  loginWindowEnd: Date;
  durationMinutes: number;
  linkToken: string; // high-entropy, single purpose
  questionGenMode: QuestionGenMode;
  allowedStudents: string[]; // ID numbers, sanitized + deduplicated
  requiresAccessCode: boolean;
  accessCodeHash?: string | null; // second factor, hashed - never store plaintext
  status: TestStatus;
  window: TestWindow;
  rosterUploadLog: IRosterUploadLog[];
  studentLoginAttempts: IStudentLoginAttempt[];
  createdAt: Date;
}

const RosterUploadLogSchema = new Schema<IRosterUploadLog>(
  {
    uploadedAt: { 
      type: Date, 
      default: Date.now 
    },

    acceptedCount: { 
      type: Number, 
      required: true 
    },

    rejectedCount: { 
      type: Number, 
      required: true 
    },

    rejectedReasons: [{ 
      type: String 
    }],
  },

  { 
    _id: false 
  }
);

const StudentLoginAttemptSchema = new Schema<IStudentLoginAttempt>(
  {
    idNumber: {
      type: String,
      required: true,
      trim: true,
    },

    failedAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    lockedUntil: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
  }
);

const TestSchema = new Schema<ITest>({
  lecturerId: { 
    type: Schema.Types.ObjectId, 
    ref: "User", 
    required: true, 
    index: true 
  },

  title: { 
    type: String, 
    required: true, 
    trim: true 
  },

  topics: [
    { 
      type: String, 
      trim: true 
    }
  ],

  loginWindowStart: { 
    type: Date, 
    required: true 
  },

  loginWindowEnd: { 
    type: Date, 
    required: true 
  },

  durationMinutes: { 
    type: Number, 
    required: true, 
    min: 1, 
    max: 480 
  },

  linkToken: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },

  questionGenMode: { 
    type: String, 
    enum: ["ai", "manual"], 
    required: true 
  },

  allowedStudents: [{ 
    type: String, 
    index: true 
  }],

  requiresAccessCode: { 
    type: Boolean, 
    default: true 
  },
  
  accessCodeHash: { 
    type: String, 
    default: null, 
    select: false 
  },

  status: { 
    type: String, 
    enum: ["draft", "published"], 
    default: "draft" 
  },

  window: {
    type: String,
    enum: ["opened", "closed"],
    default: "closed"
  },

  rosterUploadLog: [RosterUploadLogSchema],

  studentLoginAttempts: [StudentLoginAttemptSchema],

  createdAt: { 
    type: Date, 
    default: Date.now 
  },
});

export const Test = model<ITest>("Test", TestSchema);
