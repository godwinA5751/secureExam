import { Schema, model, Document, Types } from "mongoose";

export type AttemptStatus = "in-progress" | "submitted" | "auto-submitted";

export interface IAnswer {
  questionId: Types.ObjectId;
  selectedOptionIndex: number;
}

export interface IVisibilityEvent {
  type: "blur" | "hidden" | "focus" | "visible";
  at: Date;
}

export interface IAttempt extends Document {
  _id: Types.ObjectId;
  testId: Types.ObjectId;
  studentId: Types.ObjectId;
  status: AttemptStatus;
  shuffleMap: { questionOrder: Types.ObjectId[]; optionOrder: Record<string, number[]> };
  answers: IAnswer[];
  score: number | null;
  startedAt: Date;
  deadline: Date; // computed ONCE at login: min(startedAt + durationMinutes, loginWindowEnd)
  wasShortened: boolean;
  visibilityEvents: IVisibilityEvent[];
  submittedAt: Date | null;
}

const AttemptSchema = new Schema<IAttempt>({
  testId: { 
    type: Schema.Types.ObjectId, 
    ref: "Test", 
    required: true 
  },

  studentId: { 
    type: Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },

  status: { 
    type: String, 
    enum: ["in-progress", "submitted", "auto-submitted"], 
    default: "in-progress" 
  },

  shuffleMap: {
    questionOrder: [
      { 
        type: Schema.Types.ObjectId, 
        ref: "Question" 
      }
    ],
    optionOrder: { 
      type: Schema.Types.Mixed, 
      default: {} 
    },
  },

  answers: [
    {
      _id: false,
      questionId: { 
        type: Schema.Types.ObjectId, 
        ref: "Question", 
        required: true 
      },
      selectedOptionIndex: { 
        type: Number, 
        required: true 
      },
    },
  ],

  score: { type: Number, default: null },
  startedAt: { type: Date, required: true },
  deadline: { type: Date, required: true },
  wasShortened: { type: Boolean, default: false },
  visibilityEvents: [
    {
      _id: false,
      type: { type: String, enum: ["blur", "hidden", "focus", "visible"], required: true },
      at: { type: Date, default: Date.now },
    },
  ],
  submittedAt: { type: Date, default: null },
});

// CRITICAL: enforces "one attempt per student per test" atomically at the DB layer.
// Do not rely on an application-level exists-check alone (race condition).
AttemptSchema.index(
  { 
    testId: 1, 
    studentId: 1 
  }, 
  { 
    unique: true 
  }
);

export const Attempt = model<IAttempt>("Attempt", AttemptSchema);
