import { Schema, model, Document, Types } from "mongoose";

export type QuestionGenMode = "ai" | "manual";
export type TestStatus = "draft" | "published";
export type TestWindow = "opened" | "closed";

export interface IRosterName {
  idNumber: string;
  name: string;
}
export interface IRosterUploadLog {
  uploadedAt: Date;
  acceptedCount: number;
  rejectedCount: number;
  rejectedReasons: string[];
}

export interface ITest extends Document {
  _id: Types.ObjectId;
  lecturerId: Types.ObjectId;
  title: string;
  topics: string[];
  instructions: string;
  loginWindowStart: Date;
  loginWindowEnd: Date;
  durationMinutes: number;
  linkToken: string; // high-entropy, single purpose
  questionGenMode: QuestionGenMode;
  allowedStudents: string[]; // ID numbers, sanitized + deduplicated
  rosterNames: IRosterName[];
  requiresAccessCode: boolean;
  accessCodeHash?: string | null; // second factor, hashed - never store plaintext
  status: TestStatus;
  window: TestWindow;
  rosterUploadLog: IRosterUploadLog[];
  createdAt: Date;
}

const RosterNameSchema = new Schema<IRosterName>(
  {
    idNumber: { type: String, required: true },
    name: { type: String, required: true, maxlength: 100 },
  },
  { _id: false }
);

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

const TestSchema = new Schema<ITest>({
  lecturerId: { 
    type: Schema.Types.ObjectId, 
    ref: "User", 
    required: true, 
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

  instructions: {
    type: String,
    default: "",
    trim: true,
    maxlength: 4000,
  },

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

  allowedStudents: [String],
  rosterNames: [RosterNameSchema],

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

  createdAt: { 
    type: Date, 
    default: Date.now 
  },
});

TestSchema.index({ loginWindowEnd: 1 }, { partialFilterExpression: { window: "opened" } });// auto-close job
TestSchema.index({ lecturerId: 1, createdAt: -1 }); 

export const Test = model<ITest>("Test", TestSchema);
