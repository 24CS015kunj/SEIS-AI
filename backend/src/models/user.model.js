import { Schema } from "mongoose";
import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    githubId: {
      type: String,
      requried: true,
      unique: true,
    },
    githubUsername: {
      type: String,
      requried: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
    },

    avatarUrl: {
      type: String,
    },

    bio: {
      type: String,
    },

    company: {
      type: String,
    },

    location: {
      type: String,
    },

    blog: {
      type: String,
    },

    twitterUsername: {
      type: String,
    },

    githubProfileUrl: {
      type: String,
    },

    publicRepos: {
      type: Number,
      default: 0,
    },

    publicGists: {
      type: Number,
      default: 0,
    },

    followers: {
      type: Number,
      default: 0,
    },

    following: {
      type: Number,
      default: 0,
    },

    githubCreatedAt: {
      type: Date,
    },

    lastSyncedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

const User=mongoose.model("User",UserSchema);

export default User;