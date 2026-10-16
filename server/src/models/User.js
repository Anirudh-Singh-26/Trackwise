import mongoose from "mongoose";
const schema = new mongoose.Schema({
  name: {type:String, required:true, trim:true},
  email: {type:String, required:true, unique:true, lowercase:true, trim:true, index:true},
  passwordHash: {type:String, required:true, select:false},
  role: {type:String, enum:["admin","manager","employee"], default:"employee", index:true},
  managerId: {type:mongoose.Schema.Types.ObjectId, ref:"User", default:null},
  teamName: {type:String, default:"", trim:true},
  isActive: {type:Boolean, default:true}
}, {timestamps:true});
export default mongoose.model("User", schema);
