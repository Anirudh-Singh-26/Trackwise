import mongoose from "mongoose";
const schema = new mongoose.Schema({
  employeeId:{type:mongoose.Schema.Types.ObjectId, ref:"User", required:true, index:true},
  startedAt:{type:Date, default:Date.now, required:true},
  endedAt:{type:Date, default:null},
  status:{type:String, enum:["active","ended"], default:"active", index:true},
  lastHeartbeatAt:{type:Date, default:Date.now},
  browserState:{type:String, enum:["active","idle","locked","unknown"], default:"unknown"},
  browserStateUpdatedAt:{type:Date, default:null},
  qualityFlags:{type:[String], default:[]}
},{timestamps:true});
schema.index({employeeId:1,status:1});
// Database-level guard prevents duplicate active sessions under concurrent requests.
schema.index({ employeeId: 1 }, { unique: true, partialFilterExpression: { status: "active" } });
export default mongoose.model("WorkSession", schema);
