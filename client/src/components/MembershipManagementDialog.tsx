import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

interface MembershipManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number;
  currentMembership: string;
  onSuccess: () => void;
}

export function MembershipManagementDialog({
  open,
  onOpenChange,
  userId,
  currentMembership,
  onSuccess,
}: MembershipManagementDialogProps) {
  const [action, setAction] = useState<'upgrade' | 'downgrade' | 'extend' | 'cancel'>('upgrade');
  const [plan, setPlan] = useState<'monthly' | 'annual'>('monthly');
  const [daysToAdd, setDaysToAdd] = useState('30');

  const upgradeMutation = trpc.membershipManagement.upgradeMembership.useMutation();
  const downgradeMutation = trpc.membershipManagement.downgradeToFree.useMutation();
  const extendMutation = trpc.membershipManagement.extendMembership.useMutation();
  const cancelMutation = trpc.membershipManagement.cancelMembership.useMutation();

  const handleSubmit = async () => {
    try {
      switch (action) {
        case 'upgrade':
          await upgradeMutation.mutateAsync({
            userId,
            plan,
          });
          toast.success(`User upgraded to ${plan} membership`);
          break;

        case 'downgrade':
          await downgradeMutation.mutateAsync({ userId });
          toast.success('User downgraded to free membership');
          break;

        case 'extend':
          await extendMutation.mutateAsync({
            userId,
            daysToAdd: parseInt(daysToAdd),
          });
          toast.success(`Membership extended by ${daysToAdd} days`);
          break;

        case 'cancel':
          await cancelMutation.mutateAsync({ userId });
          toast.success('Membership canceled');
          break;
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update membership');
    }
  };

  const isLoading =
    upgradeMutation.isPending ||
    downgradeMutation.isPending ||
    extendMutation.isPending ||
    cancelMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Manage User Membership</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="action">Action</Label>
            <Select value={action} onValueChange={(value: any) => setAction(value)}>
              <SelectTrigger id="action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upgrade">Upgrade Membership</SelectItem>
                <SelectItem value="downgrade">Downgrade to Free</SelectItem>
                <SelectItem value="extend">Extend Membership</SelectItem>
                <SelectItem value="cancel">Cancel Membership</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {action === 'upgrade' && (
            <div>
              <Label htmlFor="plan">Select Plan</Label>
              <Select value={plan} onValueChange={(value: any) => setPlan(value)}>
                <SelectTrigger id="plan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly ($29.99/month)</SelectItem>
                  <SelectItem value="annual">Annual ($24.99/month, 12-month commitment)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {action === 'extend' && (
            <div>
              <Label htmlFor="days">Days to Add</Label>
              <Input
                id="days"
                type="number"
                min="1"
                max="365"
                value={daysToAdd}
                onChange={(e) => setDaysToAdd(e.target.value)}
                placeholder="Number of days"
              />
            </div>
          )}

          {action === 'downgrade' && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
              This will downgrade the user to a free account and end their membership immediately.
            </div>
          )}

          {action === 'cancel' && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
              This will cancel the user's subscription and downgrade them to free membership.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Processing...' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
