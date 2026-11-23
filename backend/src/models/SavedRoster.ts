
import { Schema, model, Document, Types } from "mongoose";

export interface ISavedRosterStudent {
  idNumber: string;
  name: string;
}

export interface ISavedRoster extends Document {
  _id: Types.ObjectId;
  lecturerId: Types.ObjectId;
  name: string;
  students: ISavedRosterStudent[];
  createdAt: Date;
  updatedAt: Date;
}

const SavedRosterStudentSchema = new Schema<ISavedRosterStudent>(
  {
    idNumber: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
  },
  { _id: false }
);

const SavedRosterSchema = new Schema<ISavedRoster>(
  {
    lecturerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    students: {
      type: [SavedRosterStudentSchema],
      required: true,
      validate: {
        validator: (students: ISavedRosterStudent[]) =>
          students.length > 0,
        message: "A saved roster must contain at least one student.",
      },
    },
  },
  {
    timestamps: true,
  }
);

SavedRosterSchema.index({ lecturerId: 1, updatedAt: -1 });

export const SavedRoster = model<ISavedRoster>(
  "SavedRoster",
  SavedRosterSchema
);
