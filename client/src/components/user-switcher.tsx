import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

interface User {
    id: string;
    name: string;
    avatar?: string;
}

interface UserSwitcherProps {
    currentUser: string;
    onUserChange: (userId: string) => void;
}

export function UserSwitcher({ currentUser, onUserChange }: UserSwitcherProps) {
    const { data: users } = useQuery<User[]>({
        queryKey: ["/api/users"],
    });

    return (
        <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Trading as:</span>
            <div className="flex gap-1">
                {users?.map((user) => (
                    <Button
                        key={user.id}
                        variant={currentUser === user.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => onUserChange(user.id)}
                        className={`${currentUser === user.id
                                ? "bg-purple-600 hover:bg-purple-700"
                                : "border-slate-600 text-slate-300 hover:bg-slate-700"
                            }`}
                    >
                        <span className="mr-1">{user.avatar}</span>
                        {user.name}
                    </Button>
                ))}
            </div>
        </div>
    );
}
