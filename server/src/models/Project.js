import mongoose from "mongoose";

export const ROLES = ["viewer", "editor", "owner"]; // ordered by power

const memberSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ROLES, required: true },
  },
  { _id: false },
);

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    topics: [{ type: String, trim: true, maxlength: 80 }],
    level: { type: String, enum: ["beginner", "intermediate", "advanced"], default: "intermediate" },
    goal: { type: String, trim: true, maxlength: 300, default: "" },
    members: { type: [memberSchema], validate: (v) => v.length > 0 },
  },
  { timestamps: true },
);
projectSchema.index({ "members.userId": 1 });

projectSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Project = mongoose.model("Project", projectSchema);
