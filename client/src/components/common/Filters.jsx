import { today } from "../../utils/dateTime";
export function Filters({ from, to, setFrom, setTo }) { return <div className="filters"><label>From<input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}/></label><label>To<input type="date" value={to} min={from} max={today()} onChange={e => setTo(e.target.value)}/></label></div>; }
