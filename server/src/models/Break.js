import mongoose from "mongoose";
const schema = new mongoose.Schema({
  employeeId:{type:mongoose.Schema.Types.ObjectId, ref:"User", required:true},
  sessionId:{type:mongoose.Schema.Types.ObjectId, ref:"WorkSession", required:true, index:true},
  type:{type:String, enum:["lunch","short_break","personal","other"], required:true},
  startedAt:{type:Date, default:Date.now},
  endedAt:{type:Date, default:null},
  status:{type:String, enum:["active","ended"], default:"active"}
},{timestamps:true});
schema.index({sessionId:1,status:1});
// At most one active break per session, even when requests race.
schema.index({ sessionId: 1 }, { unique: true, partialFilterExpression: { status: "active" } });
export default mongoose.model("Break", schema);
