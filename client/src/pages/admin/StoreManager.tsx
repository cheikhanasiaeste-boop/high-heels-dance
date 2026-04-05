import { AdminLayout } from "@/components/AdminLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Star,
  Plus,
  Search,
  Package,
  ChevronUp,
  ChevronDown,
  X,
  ChevronsUpDown,
  AlertTriangle,
  Download,
} from "lucide-react";

const CATEGORIES = ["tops", "bottoms", "accessories", "shoes", "other"] as const;
type Category = (typeof CATEGORIES)[number];

interface CreateFormState {
  title: string;
  description: string;
  category: Category;
  subcategory: string;
  basePrice: string;
  discountPercent: string;
  seoTitle: string;
  seoDescription: string;
  isFeatured: boolean;
}

const EMPTY_CREATE_FORM: CreateFormState = {
  title: "",
  description: "",
  category: "tops",
  subcategory: "",
  basePrice: "",
  discountPercent: "",
  seoTitle: "",
  seoDescription: "",
  isFeatured: false,
};

// ---------- Component ----------

export default function StoreManager() {
  const { user, isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  // UI state
  const [activeTab, setActiveTab] = useState<"products" | "orders">("products");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);

  // Orders state
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("");
  const [orderPage, setOrderPage] = useState(1);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedOrderStatus, setSelectedOrderStatus] = useState<string>("");

  const utils = trpc.useUtils();

  // Auth redirect
  useEffect(() => {
    if (!loading && (!isAuthenticated || user?.role !== "admin")) {
      navigate("/");
    }
  }, [isAuthenticated, user, loading, navigate]);

  // ---- Queries ----
  const { data: products, isLoading: productsLoading } =
    trpc.adminStore.products.list.useQuery(
      {
        search: search || undefined,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
      },
      { enabled: isAuthenticated && user?.role === "admin" }
    );

  const ordersQuery = trpc.adminStore.orders.list.useQuery(
    {
      status: orderStatusFilter || undefined,
      page: orderPage,
      limit: 20,
    },
    { enabled: isAuthenticated && user?.role === "admin" && activeTab === "orders" }
  );

  const selectedOrderQuery = trpc.adminStore.orders.getById.useQuery(
    { id: selectedOrderId! },
    { enabled: !!selectedOrderId }
  );

  // ---- Mutations ----
  const createMutation = trpc.adminStore.products.create.useMutation({
    onSuccess: () => {
      toast.success("Product created");
      utils.adminStore.products.list.invalidate();
      setCreateModalOpen(false);
      setCreateForm(EMPTY_CREATE_FORM);
    },
    onError: (err) => toast.error(err.message || "Failed to create product"),
  });

  const deleteMutation = trpc.adminStore.products.delete.useMutation({
    onSuccess: () => {
      toast.success("Product deleted");
      utils.adminStore.products.list.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to delete product"),
  });

  const publishMutation = trpc.adminStore.products.publish.useMutation({
    onSuccess: () => {
      toast.success("Product published");
      utils.adminStore.products.list.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to publish product"),
  });

  const unpublishMutation = trpc.adminStore.products.unpublish.useMutation({
    onSuccess: () => {
      toast.success("Product unpublished");
      utils.adminStore.products.list.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to unpublish product"),
  });

  const updateStatusMutation = trpc.adminStore.orders.updateStatus.useMutation({
    onSuccess: () => {
      ordersQuery.refetch();
      selectedOrderQuery.refetch();
      toast.success("Order status updated");
    },
    onError: (err) => toast.error(err.message || "Failed to update status"),
  });

  // ---- Handlers ----
  const handleCreate = () => {
    if (!createForm.title.trim() || !createForm.basePrice) return;
    createMutation.mutate({
      title: createForm.title.trim(),
      description: createForm.description.trim(),
      category: createForm.category,
      subcategory: createForm.subcategory.trim() || undefined,
      basePrice: parseFloat(createForm.basePrice),
      discountPercent: createForm.discountPercent
        ? parseFloat(createForm.discountPercent)
        : undefined,
      seoTitle: createForm.seoTitle.trim() || undefined,
      seoDescription: createForm.seoDescription.trim() || undefined,
      isFeatured: createForm.isFeatured,
    });
  };

  const handleDelete = (id: number) => {
    if (window.confirm("Are you sure you want to delete this product? This cannot be undone.")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleTogglePublish = (product: NonNullable<typeof products>[number]) => {
    if (product.isPublished) {
      unpublishMutation.mutate({ id: product.id });
    } else {
      publishMutation.mutate({ id: product.id });
    }
  };

  const handleExportCsv = async () => {
    try {
      const result = await utils.adminStore.orders.exportCsv.fetch({
        status: orderStatusFilter || undefined,
      });
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orders-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.message || "Failed to export CSV");
    }
  };

  const formatDate = (dateStr: string | Date) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IE", { day: "2-digit", month: "short", year: "numeric" });
  };

  const ORDER_STATUS_COLORS: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    paid: "bg-blue-100 text-blue-800 border-blue-200",
    shipped: "bg-purple-100 text-purple-800 border-purple-200",
    delivered: "bg-green-100 text-green-800 border-green-200",
    cancelled: "bg-red-100 text-red-800 border-red-200",
  };

  // ---- Loading / Auth guard ----
  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </AdminLayout>
    );
  }

  if (!isAuthenticated || user?.role !== "admin") {
    return null;
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Store Manager</h1>
            <p className="text-muted-foreground mt-1">
              Manage products, images, variants, and inventory
            </p>
          </div>
          {activeTab === "products" && (
            <Button onClick={() => setCreateModalOpen(true)}>
              <Plus className="h-4 w-4" />
              Create Product
            </Button>
          )}
        </div>

        {/* Tab Bar */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("products")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "products"
                ? "bg-[#E879F9]/20 text-[#E879F9] border border-[#E879F9]/30"
                : "text-white/60 hover:text-white/80"
            }`}
          >
            Products
          </button>
          <button
            onClick={() => setActiveTab("orders")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "orders"
                ? "bg-[#E879F9]/20 text-[#E879F9] border border-[#E879F9]/30"
                : "text-white/60 hover:text-white/80"
            }`}
          >
            Orders
          </button>
        </div>

        {/* ===== Products Tab ===== */}
        {activeTab === "products" && (
          <>
        {/* Search + Filter */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="pl-9"
            />
          </div>
          <Select
            value={categoryFilter}
            onValueChange={(val) => setCategoryFilter(val)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Product List Table */}
        {productsLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : products && products.length > 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="pl-4 w-[50px]">Image</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Featured</TableHead>
                  <TableHead className="text-right pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    {/* Thumbnail */}
                    <TableCell className="pl-4">
                      {product.images && product.images.length > 0 ? (
                        <img
                          src={product.images[0].imageUrl}
                          alt={product.images[0].altText || product.title}
                          className="w-10 h-10 object-cover rounded"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center">
                          <Package className="h-4 w-4 text-gray-400" />
                        </div>
                      )}
                    </TableCell>

                    {/* Title */}
                    <TableCell>
                      <button
                        onClick={() => setEditingProductId(product.id)}
                        className="text-left hover:text-primary transition-colors"
                      >
                        <div className="font-medium truncate max-w-[200px]">
                          {product.title}
                        </div>
                        {product.variantCount > 0 && (
                          <div className="text-xs text-gray-400">
                            {product.variantCount} variant{product.variantCount !== 1 ? "s" : ""}
                          </div>
                        )}
                      </button>
                    </TableCell>

                    {/* Category */}
                    <TableCell>
                      <span className="capitalize text-gray-600">{product.category}</span>
                    </TableCell>

                    {/* Price */}
                    <TableCell className="font-medium">
                      {"\u20AC"}
                      {Number(product.basePrice).toFixed(2)}
                    </TableCell>

                    {/* Stock */}
                    <TableCell>
                      <span
                        className={
                          product.totalStock === 0
                            ? "text-red-600 font-medium"
                            : "text-gray-700"
                        }
                      >
                        {product.totalStock}
                      </span>
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      {product.isPublished ? (
                        <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
                          Published
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100"
                        >
                          Draft
                        </Badge>
                      )}
                    </TableCell>

                    {/* Featured */}
                    <TableCell>
                      {product.isFeatured ? (
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      ) : (
                        <Star className="h-4 w-4 text-gray-300" />
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right pr-4">
                      <div className="flex items-center justify-end gap-1">
                        {/* Edit */}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setEditingProductId(product.id)}
                          title="Edit product"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>

                        {/* Publish / Unpublish */}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleTogglePublish(product)}
                          disabled={
                            publishMutation.isPending || unpublishMutation.isPending
                          }
                          title={product.isPublished ? "Unpublish" : "Publish"}
                        >
                          {product.isPublished ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>

                        {/* Toggle Featured — uses update mutation */}
                        <ToggleFeaturedButton productId={product.id} isFeatured={product.isFeatured} />

                        {/* Delete */}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDelete(product.id)}
                          disabled={deleteMutation.isPending}
                          title="Delete product"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No products found</p>
            <p className="text-gray-400 text-sm mt-1">
              {search
                ? "Try a different search term"
                : "Create your first product to get started"}
            </p>
          </div>
        )}
          </>
        )}

        {/* ===== Orders Tab ===== */}
        {activeTab === "orders" && (
          <div className="space-y-4">
            {/* Filters bar */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Select
                  value={orderStatusFilter || "all"}
                  onValueChange={(val) => {
                    setOrderStatusFilter(val === "all" ? "" : val);
                    setOrderPage(1);
                  }}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="shipped">Shipped</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1.5">
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>

            {/* Orders Table */}
            {ordersQuery.isLoading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : ordersQuery.data && ordersQuery.data.orders.length > 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="pl-4">#</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordersQuery.data.orders.map((order) => (
                      <TableRow
                        key={order.id}
                        className="cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => {
                          setSelectedOrderId(order.id);
                          setSelectedOrderStatus(order.status);
                        }}
                      >
                        <TableCell className="pl-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-sm">#{order.id}</span>
                            {order.hasStockIssue && (
                              <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-gray-700">{order.email}</TableCell>
                        <TableCell className="text-sm text-gray-600">{order.itemCount}</TableCell>
                        <TableCell className="font-medium text-sm">{"\u20AC"}{Number(order.total).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge
                            className={`text-xs capitalize border ${ORDER_STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-600 border-gray-200"} hover:opacity-100`}
                          >
                            {order.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">{formatDate(order.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
                <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No orders found</p>
                <p className="text-gray-400 text-sm mt-1">Orders will appear here once customers make purchases.</p>
              </div>
            )}

            {/* Pagination */}
            {ordersQuery.data && ordersQuery.data.total > 20 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-gray-500">
                  Page {orderPage} of {Math.ceil(ordersQuery.data.total / 20)}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOrderPage((p) => Math.max(1, p - 1))}
                    disabled={orderPage === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOrderPage((p) => p + 1)}
                    disabled={orderPage >= Math.ceil(ordersQuery.data.total / 20)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- Create Product Modal ---- */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Product</DialogTitle>
            <DialogDescription>
              Fill in the product details below. You can add images and variants after creation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Title *</label>
              <Input
                value={createForm.title}
                onChange={(e) =>
                  setCreateForm((p) => ({ ...p, title: e.target.value }))
                }
                placeholder="Product title"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Description</label>
              <Textarea
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm((p) => ({ ...p, description: e.target.value }))
                }
                placeholder="Product description..."
                rows={3}
              />
            </div>

            {/* Category + Subcategory */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Category *</label>
                <Select
                  value={createForm.category}
                  onValueChange={(val) =>
                    setCreateForm((p) => ({ ...p, category: val as Category }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Subcategory</label>
                <Input
                  value={createForm.subcategory}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, subcategory: e.target.value }))
                  }
                  placeholder="Optional"
                />
              </div>
            </div>

            {/* Price + Discount */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Base Price ({"\u20AC"}) *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={createForm.basePrice}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, basePrice: e.target.value }))
                  }
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Discount %</label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={createForm.discountPercent}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, discountPercent: e.target.value }))
                  }
                  placeholder="0"
                />
              </div>
            </div>

            {/* SEO */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">SEO Title</label>
              <Input
                value={createForm.seoTitle}
                onChange={(e) =>
                  setCreateForm((p) => ({ ...p, seoTitle: e.target.value }))
                }
                placeholder="Optional SEO title"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">SEO Description</label>
              <Textarea
                value={createForm.seoDescription}
                onChange={(e) =>
                  setCreateForm((p) => ({ ...p, seoDescription: e.target.value }))
                }
                placeholder="Optional SEO description..."
                rows={2}
              />
            </div>

            {/* Featured */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="create-featured"
                checked={createForm.isFeatured}
                onCheckedChange={(checked) =>
                  setCreateForm((p) => ({ ...p, isFeatured: !!checked }))
                }
              />
              <label htmlFor="create-featured" className="text-sm font-medium text-gray-700 cursor-pointer">
                Featured product
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateModalOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !createForm.title.trim() || !createForm.basePrice}
            >
              {createMutation.isPending ? "Creating..." : "Create Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Edit Product Modal ---- */}
      {editingProductId !== null && (
        <EditProductModal
          productId={editingProductId}
          onClose={() => setEditingProductId(null)}
        />
      )}

      {/* ---- Order Detail Modal ---- */}
      {selectedOrderId !== null && (
        <Dialog open onOpenChange={(open) => { if (!open) setSelectedOrderId(null); }}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Order #{selectedOrderId}</DialogTitle>
              <DialogDescription>
                View order details and update status.
              </DialogDescription>
            </DialogHeader>

            {selectedOrderQuery.isLoading || !selectedOrderQuery.data ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : (() => {
              const order = selectedOrderQuery.data;
              return (
                <div className="space-y-5 py-2">
                  {/* Stock issue banner */}
                  {order.hasStockIssue && (
                    <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <span>Stock issue: one or more items exceeded available inventory.</span>
                    </div>
                  )}

                  {/* Order meta */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Customer</span>
                      <p className="font-medium break-all">{order.email}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Date</span>
                      <p className="font-medium">{formatDate(order.createdAt)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Status</span>
                      <p>
                        <Badge
                          className={`text-xs capitalize border ${ORDER_STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-600 border-gray-200"} hover:opacity-100`}
                        >
                          {order.status}
                        </Badge>
                      </p>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="border-t pt-4 space-y-2">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Items</h3>
                    <div className="bg-gray-50 rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-100">
                            <TableHead className="pl-3">Product</TableHead>
                            <TableHead>Variant</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right pr-3">Unit Price</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {order.items?.map((item: any, idx: number) => (
                            <TableRow key={idx}>
                              <TableCell className="pl-3 text-sm">{item.productTitle}</TableCell>
                              <TableCell className="text-sm text-gray-500">{item.variantKey || "-"}</TableCell>
                              <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                              <TableCell className="text-right pr-3 text-sm">{"\u20AC"}{Number(item.unitPrice).toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="border-t pt-3 space-y-1 text-sm">
                    {order.discountAmount != null && Number(order.discountAmount) > 0 && (
                      <div className="flex justify-between text-green-700">
                        <span>Discount</span>
                        <span>-{"\u20AC"}{Number(order.discountAmount).toFixed(2)}</span>
                      </div>
                    )}
                    {order.shippingCost != null && (
                      <div className="flex justify-between text-gray-600">
                        <span>Shipping</span>
                        <span>{"\u20AC"}{Number(order.shippingCost).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold text-base pt-1 border-t">
                      <span>Total</span>
                      <span>{"\u20AC"}{Number(order.total).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Shipping address */}
                  {order.shippingAddress && (
                    <div className="border-t pt-3 space-y-1 text-sm">
                      <h3 className="font-semibold text-gray-500 uppercase tracking-wide text-xs">Shipping Address</h3>
                      <p className="text-gray-700 whitespace-pre-line">
                        {typeof order.shippingAddress === "string"
                          ? order.shippingAddress
                          : JSON.stringify(order.shippingAddress, null, 2)}
                      </p>
                    </div>
                  )}

                  {/* Customer notes */}
                  {(order as any).notes && (
                    <div className="border-t pt-3 space-y-1 text-sm">
                      <h3 className="font-semibold text-gray-500 uppercase tracking-wide text-xs">Customer Notes</h3>
                      <p className="text-gray-700">{(order as any).notes}</p>
                    </div>
                  )}

                  {/* Status update */}
                  <div className="border-t pt-4 space-y-2">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Update Status</h3>
                    <div className="flex items-center gap-3">
                      <Select
                        value={selectedOrderStatus}
                        onValueChange={setSelectedOrderStatus}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="shipped">Shipped</SelectItem>
                          <SelectItem value="delivered">Delivered</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        onClick={() =>
                          updateStatusMutation.mutate({
                            id: selectedOrderId!,
                            status: selectedOrderStatus,
                          })
                        }
                        disabled={
                          updateStatusMutation.isPending ||
                          selectedOrderStatus === order.status
                        }
                      >
                        {updateStatusMutation.isPending ? "Updating..." : "Update"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()}

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedOrderId(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AdminLayout>
  );
}

// =============================================
// Toggle Featured Button (inline sub-component)
// =============================================

function ToggleFeaturedButton({
  productId,
  isFeatured,
}: {
  productId: number;
  isFeatured: boolean;
}) {
  const utils = trpc.useUtils();
  const updateMutation = trpc.adminStore.products.update.useMutation({
    onSuccess: () => {
      toast.success(isFeatured ? "Removed from featured" : "Marked as featured");
      utils.adminStore.products.list.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to update"),
  });

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => updateMutation.mutate({ id: productId, isFeatured: !isFeatured })}
      disabled={updateMutation.isPending}
      title={isFeatured ? "Remove featured" : "Mark as featured"}
    >
      <Star
        className={
          isFeatured
            ? "h-4 w-4 text-yellow-500 fill-yellow-500"
            : "h-4 w-4 text-gray-400"
        }
      />
    </Button>
  );
}

// =============================================
// Edit Product Modal (big sub-component)
// =============================================

function EditProductModal({
  productId,
  onClose,
}: {
  productId: number;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();

  const { data: product, isLoading } = trpc.adminStore.products.getById.useQuery(
    { id: productId },
    { enabled: true }
  );

  // Form state — initialized from product data
  const [form, setForm] = useState<{
    title: string;
    description: string;
    category: Category;
    subcategory: string;
    basePrice: string;
    discountPercent: string;
    seoTitle: string;
    seoDescription: string;
    isFeatured: boolean;
  } | null>(null);

  // Initialize form when product loads
  useEffect(() => {
    if (product && !form) {
      setForm({
        title: product.title ?? "",
        description: product.description ?? "",
        category: (product.category as Category) ?? "other",
        subcategory: product.subcategory ?? "",
        basePrice: String(product.basePrice ?? ""),
        discountPercent: product.discountPercent ? String(product.discountPercent) : "",
        seoTitle: product.seoTitle ?? "",
        seoDescription: product.seoDescription ?? "",
        isFeatured: product.isFeatured ?? false,
      });
    }
  }, [product, form]);

  // Image form state
  const [newImageUrl, setNewImageUrl] = useState("");
  const [newImageAlt, setNewImageAlt] = useState("");

  // Variant form state
  const [newVariantColor, setNewVariantColor] = useState("");
  const [newVariantSize, setNewVariantSize] = useState("");
  const [newVariantStock, setNewVariantStock] = useState("0");

  // Bulk create state
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkColors, setBulkColors] = useState("");
  const [bulkSizes, setBulkSizes] = useState("");
  const [bulkStock, setBulkStock] = useState("0");

  // ---- Mutations ----
  const updateMutation = trpc.adminStore.products.update.useMutation({
    onSuccess: () => {
      toast.success("Product updated");
      utils.adminStore.products.list.invalidate();
      utils.adminStore.products.getById.invalidate({ id: productId });
      onClose();
    },
    onError: (err) => toast.error(err.message || "Failed to update product"),
  });

  // Images
  const addImageMutation = trpc.adminStore.images.add.useMutation({
    onSuccess: () => {
      toast.success("Image added");
      utils.adminStore.products.getById.invalidate({ id: productId });
      setNewImageUrl("");
      setNewImageAlt("");
    },
    onError: (err) => toast.error(err.message || "Failed to add image"),
  });

  const removeImageMutation = trpc.adminStore.images.remove.useMutation({
    onSuccess: () => {
      toast.success("Image removed");
      utils.adminStore.products.getById.invalidate({ id: productId });
    },
    onError: (err) => toast.error(err.message || "Failed to remove image"),
  });

  const reorderImagesMutation = trpc.adminStore.images.reorder.useMutation({
    onSuccess: () => {
      utils.adminStore.products.getById.invalidate({ id: productId });
    },
    onError: (err) => toast.error(err.message || "Failed to reorder images"),
  });

  // Variants
  const addVariantMutation = trpc.adminStore.variants.add.useMutation({
    onSuccess: () => {
      toast.success("Variant added");
      utils.adminStore.products.getById.invalidate({ id: productId });
      setNewVariantColor("");
      setNewVariantSize("");
      setNewVariantStock("0");
    },
    onError: (err) => toast.error(err.message || "Failed to add variant"),
  });

  const updateVariantMutation = trpc.adminStore.variants.update.useMutation({
    onSuccess: () => {
      utils.adminStore.products.getById.invalidate({ id: productId });
    },
    onError: (err) => toast.error(err.message || "Failed to update variant"),
  });

  const deleteVariantMutation = trpc.adminStore.variants.delete.useMutation({
    onSuccess: () => {
      toast.success("Variant deleted");
      utils.adminStore.products.getById.invalidate({ id: productId });
    },
    onError: (err) => toast.error(err.message || "Failed to delete variant"),
  });

  const bulkCreateMutation = trpc.adminStore.variants.bulkCreate.useMutation({
    onSuccess: () => {
      toast.success("Variants created");
      utils.adminStore.products.getById.invalidate({ id: productId });
      setBulkColors("");
      setBulkSizes("");
      setBulkStock("0");
      setBulkOpen(false);
    },
    onError: (err) => toast.error(err.message || "Failed to bulk create variants"),
  });

  // ---- Handlers ----
  const handleSave = () => {
    if (!form) return;
    updateMutation.mutate({
      id: productId,
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      subcategory: form.subcategory.trim() || undefined,
      basePrice: parseFloat(form.basePrice),
      discountPercent: form.discountPercent
        ? parseFloat(form.discountPercent)
        : undefined,
      seoTitle: form.seoTitle.trim() || undefined,
      seoDescription: form.seoDescription.trim() || undefined,
      isFeatured: form.isFeatured,
    });
  };

  const handleAddImage = () => {
    if (!newImageUrl.trim()) return;
    addImageMutation.mutate({
      productId,
      imageUrl: newImageUrl.trim(),
      altText: newImageAlt.trim() || undefined,
      displayOrder: product?.images ? product.images.length : 0,
    });
  };

  const handleMoveImage = (index: number, direction: "up" | "down") => {
    if (!product?.images) return;
    const ids = product.images.map((img) => img.id);
    const swapIdx = direction === "up" ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= ids.length) return;
    [ids[index], ids[swapIdx]] = [ids[swapIdx], ids[index]];
    reorderImagesMutation.mutate({ productId, imageIds: ids });
  };

  const handleAddVariant = () => {
    addVariantMutation.mutate({
      productId,
      color: newVariantColor.trim() || undefined,
      size: newVariantSize.trim() || undefined,
      stock: parseInt(newVariantStock) || 0,
    });
  };

  const handleBulkCreate = () => {
    const colors = bulkColors
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const sizes = bulkSizes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (colors.length === 0 || sizes.length === 0) {
      toast.error("Provide at least one color and one size");
      return;
    }
    bulkCreateMutation.mutate({
      productId,
      colors,
      sizes,
      stock: parseInt(bulkStock) || 0,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Product</DialogTitle>
          <DialogDescription>
            Update product details, manage images and variants.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !form ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {/* ---- Basic Details ---- */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Product Details</h3>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Title *</label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((p) => p && { ...p, title: e.target.value })}
                  placeholder="Product title"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Description</label>
                <Textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm((p) => p && { ...p, description: e.target.value })
                  }
                  placeholder="Product description..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Category *</label>
                  <Select
                    value={form.category}
                    onValueChange={(val) =>
                      setForm((p) => p && { ...p, category: val as Category })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Subcategory</label>
                  <Input
                    value={form.subcategory}
                    onChange={(e) =>
                      setForm((p) => p && { ...p, subcategory: e.target.value })
                    }
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Base Price ({"\u20AC"}) *</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.basePrice}
                    onChange={(e) =>
                      setForm((p) => p && { ...p, basePrice: e.target.value })
                    }
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Discount %</label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={form.discountPercent}
                    onChange={(e) =>
                      setForm((p) => p && { ...p, discountPercent: e.target.value })
                    }
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">SEO Title</label>
                <Input
                  value={form.seoTitle}
                  onChange={(e) =>
                    setForm((p) => p && { ...p, seoTitle: e.target.value })
                  }
                  placeholder="Optional SEO title"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">SEO Description</label>
                <Textarea
                  value={form.seoDescription}
                  onChange={(e) =>
                    setForm((p) => p && { ...p, seoDescription: e.target.value })
                  }
                  placeholder="Optional SEO description..."
                  rows={2}
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-featured"
                  checked={form.isFeatured}
                  onCheckedChange={(checked) =>
                    setForm((p) => p && { ...p, isFeatured: !!checked })
                  }
                />
                <label htmlFor="edit-featured" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Featured product
                </label>
              </div>
            </div>

            {/* ---- Images Section ---- */}
            <div className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Images</h3>

              {product?.images && product.images.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {product.images.map((img, idx) => (
                    <div key={img.id} className="relative group border rounded-lg p-1.5 bg-gray-50">
                      <img
                        src={img.imageUrl}
                        alt={img.altText || "Product image"}
                        className="w-20 h-20 object-cover rounded"
                      />
                      <div className="mt-1 text-[10px] text-gray-400 truncate max-w-[80px]">
                        {img.altText || "No alt text"}
                      </div>
                      {/* Reorder + Delete controls */}
                      <div className="absolute -top-2 -right-2 flex gap-0.5">
                        <button
                          onClick={() => handleMoveImage(idx, "up")}
                          disabled={idx === 0 || reorderImagesMutation.isPending}
                          className="bg-white border rounded-full p-0.5 shadow-sm hover:bg-gray-100 disabled:opacity-30"
                          title="Move left"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleMoveImage(idx, "down")}
                          disabled={idx === product.images.length - 1 || reorderImagesMutation.isPending}
                          className="bg-white border rounded-full p-0.5 shadow-sm hover:bg-gray-100 disabled:opacity-30"
                          title="Move right"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => removeImageMutation.mutate({ id: img.id })}
                          disabled={removeImageMutation.isPending}
                          className="bg-white border border-red-200 rounded-full p-0.5 shadow-sm hover:bg-red-50 text-red-500"
                          title="Remove image"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No images yet.</p>
              )}

              {/* Add image form */}
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-gray-500">Image URL</label>
                  <Input
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-gray-500">Alt Text</label>
                  <Input
                    value={newImageAlt}
                    onChange={(e) => setNewImageAlt(e.target.value)}
                    placeholder="Image description"
                    className="h-8 text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handleAddImage}
                  disabled={addImageMutation.isPending || !newImageUrl.trim()}
                >
                  {addImageMutation.isPending ? "Adding..." : "Add"}
                </Button>
              </div>
            </div>

            {/* ---- Variants Section ---- */}
            <div className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Variants</h3>

              {product?.variants && product.variants.length > 0 ? (
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="pl-3">Color</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Stock</TableHead>
                        <TableHead>Price Mod.</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right pr-3 w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {product.variants.map((variant) => (
                        <VariantRow
                          key={variant.id}
                          variant={variant}
                          onUpdate={(data) =>
                            updateVariantMutation.mutate({ id: variant.id, ...data })
                          }
                          onDelete={() => {
                            if (window.confirm("Delete this variant?")) {
                              deleteVariantMutation.mutate({ id: variant.id });
                            }
                          }}
                          isDeleting={deleteVariantMutation.isPending}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-gray-400">No variants yet.</p>
              )}

              {/* Add variant form */}
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500">Color</label>
                  <Input
                    value={newVariantColor}
                    onChange={(e) => setNewVariantColor(e.target.value)}
                    placeholder="e.g. Red"
                    className="h-8 text-sm w-24"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500">Size</label>
                  <Input
                    value={newVariantSize}
                    onChange={(e) => setNewVariantSize(e.target.value)}
                    placeholder="e.g. M"
                    className="h-8 text-sm w-20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500">Stock</label>
                  <Input
                    type="number"
                    min="0"
                    value={newVariantStock}
                    onChange={(e) => setNewVariantStock(e.target.value)}
                    className="h-8 text-sm w-20"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handleAddVariant}
                  disabled={addVariantMutation.isPending}
                >
                  {addVariantMutation.isPending ? "Adding..." : "Add"}
                </Button>
              </div>

              {/* Bulk create section */}
              <Collapsible open={bulkOpen} onOpenChange={setBulkOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-gray-500 gap-1 px-0">
                    <ChevronsUpDown className="h-3.5 w-3.5" />
                    Bulk Create Variants
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 p-3 bg-gray-50 rounded-lg border space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500">
                        Colors (comma-separated)
                      </label>
                      <Input
                        value={bulkColors}
                        onChange={(e) => setBulkColors(e.target.value)}
                        placeholder="Red, Blue, Black"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500">
                        Sizes (comma-separated)
                      </label>
                      <Input
                        value={bulkSizes}
                        onChange={(e) => setBulkSizes(e.target.value)}
                        placeholder="S, M, L, XL"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500">
                        Default Stock per Variant
                      </label>
                      <Input
                        type="number"
                        min="0"
                        value={bulkStock}
                        onChange={(e) => setBulkStock(e.target.value)}
                        className="h-8 text-sm w-24"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={handleBulkCreate}
                      disabled={bulkCreateMutation.isPending}
                    >
                      {bulkCreateMutation.isPending
                        ? "Creating..."
                        : "Create All Combinations"}
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={updateMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || !form?.title.trim() || !form?.basePrice}
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================
// Variant Row — inline-editable stock & price
// =============================================

function VariantRow({
  variant,
  onUpdate,
  onDelete,
  isDeleting,
}: {
  variant: {
    id: number;
    color: string | null;
    size: string | null;
    stock: number;
    priceModifier: number | string | null;
    sku: string | null;
    variantKey: string | null;
  };
  onUpdate: (data: { stock?: number; priceModifier?: number }) => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [stock, setStock] = useState(String(variant.stock));
  const [priceMod, setPriceMod] = useState(
    variant.priceModifier != null ? String(variant.priceModifier) : "0"
  );

  const commitStock = () => {
    const val = parseInt(stock);
    if (!isNaN(val) && val !== variant.stock) {
      onUpdate({ stock: val });
    }
  };

  const commitPriceMod = () => {
    const val = parseFloat(priceMod);
    if (!isNaN(val) && val !== Number(variant.priceModifier ?? 0)) {
      onUpdate({ priceModifier: val });
    }
  };

  return (
    <TableRow>
      <TableCell className="pl-3 text-gray-600">{variant.color || "-"}</TableCell>
      <TableCell className="text-gray-600">{variant.size || "-"}</TableCell>
      <TableCell>
        <Input
          type="number"
          min="0"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          onBlur={commitStock}
          onKeyDown={(e) => { if (e.key === "Enter") commitStock(); }}
          className="h-7 text-sm w-20"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          step="0.01"
          value={priceMod}
          onChange={(e) => setPriceMod(e.target.value)}
          onBlur={commitPriceMod}
          onKeyDown={(e) => { if (e.key === "Enter") commitPriceMod(); }}
          className="h-7 text-sm w-20"
        />
      </TableCell>
      <TableCell className="text-xs text-gray-400">{variant.sku || "-"}</TableCell>
      <TableCell className="text-right pr-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          disabled={isDeleting}
          className="text-red-500 hover:text-red-700 hover:bg-red-50"
          title="Delete variant"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
