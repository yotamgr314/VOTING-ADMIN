import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { generateClient } from "aws-amplify/api";
import type { Poll } from "../../types/poll.types";
import type { RootState } from "../../store/store";
import { updateLiveStats } from "../../store/pollSlice";
import "./LiveResults.css";

/* ========= GraphQL client ========= */
const client = generateClient();

/* ========= Subscription ========= */
const ON_STATS_UPDATED = /* GraphQL */ `
  subscription ListenToUpdates {
    onStatsUpdated {
      standings
    }
  }
`;

/* ========= Types ========= */
type LiveStats = {
  statName?: string;
  totalVotes?: number;
  [key: string]: any;
};

interface LiveResultsProps {
  poll: Poll;
  onParticipantsUpdate?: (count: number) => void;
}

export default function LiveResults({ poll, onParticipantsUpdate }: LiveResultsProps) {
  const dispatch = useDispatch();
  const liveStats = useSelector((state: RootState) => state.poll.liveStats);
  const [data, setData] = useState<LiveStats | null>(null);
  const [status, setStatus] = useState("Connecting…");

  // Load data from Redux on mount if available
  useEffect(() => {
    if (liveStats && !data) {
      setData({
        statName: poll.title,
        totalVotes: liveStats.totalVotes,
        ...liveStats.standings,
      });
    }
  }, [liveStats, poll.title, data]);

  /* ========= Subscribe on mount ========= */
  useEffect(() => {
    console.log("Connecting to AppSync subscription...");
    console.log("Poll data received:", poll);
    console.log("Poll options:", poll.options);

    const sub = (client.graphql({ query: ON_STATS_UPDATED }) as any).subscribe({
      next: ({ data }: any) => {
          try {
            const parsed = JSON.parse(data.onStatsUpdated.standings);
            setData(parsed);
            setStatus("Live ");
            
            // Save to Redux for persistence across page navigation
            const { statName, totalVotes, ...choices } = parsed;
            dispatch(updateLiveStats({
              totalVotes: totalVotes || 0,
              standings: choices,
            }));
            
            // Update parent component with live participant count
            if (onParticipantsUpdate && parsed.totalVotes !== undefined) {
              onParticipantsUpdate(parsed.totalVotes);
            }
          } catch (err) {
            console.error(" JSON parse error", err);
          }
        },
        error: (err: any) => {
          console.error(" Subscription error", err);
          setStatus("Disconnected ");
        },
      });

    return () => sub.unsubscribe();
  }, []);

  /* ========= UI ========= */
  // Show poll data even if subscription hasn't connected yet
  const displayData = data || {
    statName: poll.title,
    totalVotes: poll.totalVotes,
    ...(poll.options && Array.isArray(poll.options) 
      ? poll.options.reduce((acc, opt, index) => {
          // Smart normalization: handle both string and object formats
          const optAny = opt as any; // Allow flexible field access
          const label = typeof opt === 'string' 
            ? opt 
            : opt.text || optAny.label || optAny.option || `Option ${index + 1}`;
          
          const votes = typeof opt === 'string' 
            ? 0 
            : opt.votes || 0;
          
          acc[label] = votes;
          return acc;
        }, {} as Record<string, number>)
      : {})
  };

  const { statName, totalVotes, ...choices } = displayData;

  return (
    <div className="container">
      <div className="header">
        <h1>{statName || poll.title}</h1>
        <p>Total Participants: {totalVotes ?? poll.totalVotes ?? 0}</p>
        <span>Status: {status}</span>
      </div>

      <div className="grid">
        {Object.entries(choices).map(([key, value]) => (
          <div key={key} className="resultCard">
            <h3>{key}</h3>
            <div className="value">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

