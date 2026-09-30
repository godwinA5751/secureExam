import { Schema, model, Document, Types } from "mongoose";

export interface IQuestion extends Document {
  _id: Types.ObjectId;
  testId: Types.ObjectId;
  text: string;
  options: string[];
  correctOptionIndex: number; // NEVER serialize this to a student-facing route
  topic: string;
  approved: boolean; // lecturer must review AI-generated questions before publish
}

const QuestionSchema = new Schema<IQuestion>({
  testId: { 
    type: Schema.Types.ObjectId, 
    ref: "Test", 
    required: true, 
    index: true 
  },

  text: { 
    type: String, 
    required: true 
  },

  options: {
    type: [String],
    required: true,
    validate: (v: string[]) => v.length >= 2 && v.length <= 6,
  },

  correctOptionIndex: { 
    type: Number, 
    required: true, 
    select: false 
  },

  topic: { 
    type: String, 
    required: true 
  },

  approved: { 
    type: Boolean, 
    default: false 
  },
});

export const Question = model<IQuestion>("Question", QuestionSchema);

/** Strips the answer key. This is the ONLY shape that may ever reach a student. */
export function toStudentSafeQuestion(q: {
  _id: Types.ObjectId;
  text: string;
  options: string[];
  topic: string;
}) {
  return { 
    id: q._id, 
    text: q.text, 
    options: q.options 
  };
}
