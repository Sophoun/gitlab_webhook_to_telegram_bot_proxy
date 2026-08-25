import { UserStats } from "@/app/types";

interface UserLeaderboardProps {
  users: UserStats[];
  onSelectUser: (user: UserStats) => void;
  selectedUser: UserStats | null;
}

export function UserLeaderboard({ users, onSelectUser, selectedUser }: UserLeaderboardProps) {
  const getMedal = (index: number) => {
    switch (index) {
      case 0:
        return "🥇";
      case 1:
        return "🥈";
      case 2:
        return "🥉";
      default:
        return `#${index + 1}`;
    }
  };

  return (
    <div className="space-y-2">
      {users.slice(0, 10).map((user, index) => (
        <div
          key={user.username}
          className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
            selectedUser?.username === user.username
              ? "bg-primary/10 border border-primary/20"
              : "hover:bg-muted"
          }`}
          onClick={() => onSelectUser(user)}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold w-8 text-center">{getMedal(index)}</span>
            <div>
              <div className="font-medium">{user.name}</div>
              <div className="text-sm text-muted-foreground">@{user.username}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold text-lg">{user.score.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">points</div>
          </div>
        </div>
      ))}

      {users.length === 0 && (
        <p className="text-muted-foreground text-center py-4">
          No users found. Sync your projects to see the leaderboard.
        </p>
      )}
    </div>
  );
}
