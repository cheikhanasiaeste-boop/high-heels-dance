import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, Edit2, Copy } from "lucide-react";
import { toast } from "sonner";

export function DiscountManagement() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    description: "",
    discountType: "percentage" as const,
    discountValue: "",
    validFrom: "",
    validTo: "",
    maxUses: "",
    applicableTo: "all" as const,
  });

  const { data: codes, isLoading } = trpc.discount.list.useQuery();
  const createMutation = trpc.discount.create.useMutation();
  const updateMutation = trpc.discount.update.useMutation();
  const deleteMutation = trpc.discount.delete.useMutation();
  const utils = trpc.useUtils();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const validFrom = new Date(formData.validFrom);
      const validTo = new Date(formData.validTo);

      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          description: formData.description || undefined,
          discountValue: formData.discountValue ? Number(formData.discountValue) : undefined,
          validFrom: validFrom,
          validTo: validTo,
          maxUses: formData.maxUses ? Number(formData.maxUses) : undefined,
          applicableTo: formData.applicableTo,
        });
        toast.success("Discount code updated");
      } else {
        await createMutation.mutateAsync({
          code: formData.code.toUpperCase(),
          description: formData.description,
          discountType: formData.discountType,
          discountValue: Number(formData.discountValue),
          validFrom,
          validTo,
          maxUses: formData.maxUses ? Number(formData.maxUses) : undefined,
          applicableTo: formData.applicableTo,
        });
        toast.success("Discount code created");
      }

      await utils.discount.list.invalidate();
      setIsOpen(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || "Failed to save discount code");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this discount code?")) return;

    try {
      await deleteMutation.mutateAsync({ id });
      await utils.discount.list.invalidate();
      toast.success("Discount code deleted");
    } catch (error: any) {
      toast.error(error.message || "Failed to delete discount code");
    }
  };

  const resetForm = () => {
    setFormData({
      code: "",
      description: "",
      discountType: "percentage",
      discountValue: "",
      validFrom: "",
      validTo: "",
      maxUses: "",
      applicableTo: "all",
    });
    setEditingId(null);
  };

  const handleEdit = (code: any) => {
    setFormData({
      code: code.code,
      description: code.description || "",
      discountType: code.discountType,
      discountValue: code.discountValue.toString(),
      validFrom: code.validFrom.toISOString().split("T")[0],
      validTo: code.validTo.toISOString().split("T")[0],
      maxUses: code.maxUses?.toString() || "",
      applicableTo: code.applicableTo,
    });
    setEditingId(code.id);
    setIsOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Discount Codes</h2>
          <p className="text-muted-foreground">Manage discount codes for subscriptions and courses</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-2" />
              New Discount Code
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Discount Code" : "Create Discount Code"}</DialogTitle>
              <DialogDescription>
                {editingId
                  ? "Update the discount code details"
                  : "Create a new discount code for your customers"}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="code">Code</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="e.g., SAVE20"
                    disabled={!!editingId}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="discountType">Discount Type</Label>
                  <Select value={formData.discountType} onValueChange={(value: any) =>
                    setFormData({ ...formData, discountType: value })
                  }>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="discountValue">
                    Discount Value {formData.discountType === "percentage" ? "(%)" : "($)"}
                  </Label>
                  <Input
                    id="discountValue"
                    type="number"
                    step="0.01"
                    value={formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                    placeholder={formData.discountType === "percentage" ? "20" : "10.00"}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="applicableTo">Applicable To</Label>
                  <Select value={formData.applicableTo} onValueChange={(value: any) =>
                    setFormData({ ...formData, applicableTo: value })
                  }>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Products</SelectItem>
                      <SelectItem value="subscriptions">Subscriptions Only</SelectItem>
                      <SelectItem value="courses">Courses Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g., Summer sale - 20% off all memberships"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="validFrom">Valid From</Label>
                  <Input
                    id="validFrom"
                    type="date"
                    value={formData.validFrom}
                    onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="validTo">Valid To</Label>
                  <Input
                    id="validTo"
                    type="date"
                    value={formData.validTo}
                    onChange={(e) => setFormData({ ...formData, validTo: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="maxUses">Max Uses (Optional)</Label>
                  <Input
                    id="maxUses"
                    type="number"
                    value={formData.maxUses}
                    onChange={(e) => setFormData({ ...formData, maxUses: e.target.value })}
                    placeholder="Leave empty for unlimited"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingId ? "Update" : "Create"} Code
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading discount codes...</div>
      ) : !codes || codes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No discount codes yet. Create one to get started!
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {codes.map((code) => (
            <Card key={code.id}>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{code.code}</CardTitle>
                    <CardDescription>{code.description}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(code)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(code.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Discount</p>
                    <p className="font-semibold">
                      {code.discountType === "percentage"
                        ? `${code.discountValue}%`
                        : `$${code.discountValue}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Applicable To</p>
                    <p className="font-semibold capitalize">{code.applicableTo}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Usage</p>
                    <p className="font-semibold">
                      {code.currentUses}
                      {code.maxUses ? `/${code.maxUses}` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Valid</p>
                    <p className="font-semibold text-xs">
                      {new Date(code.validFrom).toLocaleDateString()} -{" "}
                      {new Date(code.validTo).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
