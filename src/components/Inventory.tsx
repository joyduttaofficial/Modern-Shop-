import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy, 
  increment, 
  where, 
  getDocs, 
  setDoc,
  updateDoc
} from "firebase/firestore";
import { db, OperationType, handleFirestoreError } from "@/src/lib/firebase";
import { Product, StockLedgerEntry, UserRole } from "@/src/types";
import { cn } from "@/src/lib/utils";
import { useLanguage } from "../contexts/LanguageContext";
import { 
  Plus, Search, Edit2, Trash2, Calendar, FileText, ClipboardList, Wallet, Landmark, 
  X, Check, AlertCircle, ShoppingBag, Sparkles, Loader2, ArrowUpRight, ArrowDownRight, 
  Boxes, Package, ChevronRight, HelpCircle, ArrowRightLeft, DollarSign, Calculator, RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function Inventory({
  user,
  role
}: {
  user: User;
  role: UserRole;
}) {
  const { language, t, formatCurrency } = useLanguage();
  
  // Primary Tabs
  const [activeSubTab, setActiveSubTab] = useState<"catalog" | "stockout" | "calculator">("catalog");

  // State lists
  const [products, setProducts] = useState<Product[]>([]);
  const [stockLedger, setStockLedger] = useState<StockLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Firestore loading
  useEffect(() => {
    setLoading(true);
    
    // Subscribe to products
    const unsubProducts = onSnapshot(
      collection(db, "products"),
      (snap) => {
        const prodList: Product[] = [];
        snap.forEach((doc) => {
          prodList.push({ id: doc.id, ...doc.data() } as Product);
        });
        setProducts(prodList);
        setLoading(false);
      },
      (err) => {
        console.error("Error listening to products", err);
        handleFirestoreError(err, OperationType.GET, "products");
        setLoading(false);
      }
    );

    // Subscribe to stock ledger
    const unsubLedger = onSnapshot(
      query(collection(db, "stockLedger"), orderBy("createdAt", "desc")),
      (snap) => {
        const ledgerList: StockLedgerEntry[] = [];
        snap.forEach((doc) => {
          ledgerList.push({ id: doc.id, ...doc.data() } as StockLedgerEntry);
        });
        setStockLedger(ledgerList);
      },
      (err) => console.error("Error listening to stock ledger", err)
    );

    return () => {
      unsubProducts();
      unsubLedger();
    };
  }, []);

  // Filter and Search states for Catalog
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [lowStockFilter, setLowStockFilter] = useState(false);

  // Derive categories
  const categories = React.useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return ["all", ...Array.from(cats)];
  }, [products]);

  // Filtered Products
  const filteredProducts = React.useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.category?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === "all" || p.category === selectedCategory;
      const matchesLowStock = !lowStockFilter || (p.stock || 0) <= 10;
      return matchesSearch && matchesCategory && matchesLowStock;
    });
  }, [products, searchTerm, selectedCategory, lowStockFilter]);

  // Dynamic aggregates
  const totalValuation = React.useMemo(() => {
    return products.reduce((sum, p) => sum + ((p.stock || 0) * (p.lastPurchasePrice || 0)), 0);
  }, [products]);

  const uniqueProductCount = products.length;
  const lowStockCount = products.filter(p => (p.stock || 0) <= 10 && (p.stock || 0) > 0).length;
  const outOfStockCount = products.filter(p => (p.stock || 0) === 0).length;

  // Add / Edit Product modal state
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  // Product Form parameters
  const [prodName, setProdName] = useState("");
  const [prodCategory, setProdCategory] = useState("");
  const [prodSubCategory, setProdSubCategory] = useState("");
  const [prodUnit, setProdUnit] = useState("Roll");
  const [prodStock, setProdStock] = useState<number>(0);
  const [prodLastPurchasePrice, setProdLastPurchasePrice] = useState<number>(0);
  const [submittingProduct, setSubmittingProduct] = useState(false);

  const openAddModal = () => {
    setEditingProduct(null);
    setProdName("");
    setProdCategory("");
    setProdSubCategory("");
    setProdUnit("Roll");
    setProdStock(0);
    setProdLastPurchasePrice(0);
    setProductModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setProdName(p.name || "");
    setProdCategory(p.category || "");
    setProdSubCategory(p.subCategory || "");
    setProdUnit(p.unit || "Roll");
    setProdStock(p.stock || 0);
    setProdLastPurchasePrice(p.lastPurchasePrice || 0);
    setProductModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim() || !prodCategory.trim() || !prodUnit) return;
    
    setSubmittingProduct(true);
    try {
      const trimmedName = prodName.trim();
      const productPayload = {
        name: trimmedName,
        category: prodCategory.trim(),
        subCategory: prodSubCategory.trim(),
        unit: prodUnit,
        stock: Number(prodStock),
        lastPurchasePrice: Number(prodLastPurchasePrice),
        totalPurchaseValue: Number(prodStock) * Number(prodLastPurchasePrice),
        updatedAt: new Date().toISOString()
      };

      if (editingProduct && editingProduct.id) {
        // Update product
        await updateDoc(doc(db, "products", editingProduct.id), productPayload);
        
        // Check if stock changes manually and log an adjustment
        const stockDiff = Number(prodStock) - (editingProduct.stock || 0);
        if (stockDiff !== 0) {
          const adjLedger: StockLedgerEntry = {
            productId: editingProduct.id,
            productName: trimmedName,
            date: new Date().toISOString().split("T")[0],
            type: "adjustment",
            refNo: `MAN-ADJ-${Date.now().toString().slice(-6)}`,
            quantity: Math.abs(stockDiff),
            unit: prodUnit,
            unitPrice: Number(prodLastPurchasePrice),
            totalAmount: Math.abs(stockDiff) * Number(prodLastPurchasePrice),
            createdAt: new Date().toISOString()
          };
          // Adjust base on difference direction
          await addDoc(collection(db, "stockLedger"), adjLedger);
        }
      } else {
        // Create new dynamic product
        const newDoc = {
          ...productPayload,
          createdAt: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, "products"), newDoc);
        
        // Initial ledger deposit
        if (Number(prodStock) > 0) {
          const initialLedger: StockLedgerEntry = {
            productId: docRef.id,
            productName: trimmedName,
            date: new Date().toISOString().split("T")[0],
            type: "purchase",
            refNo: `INIT-${Date.now().toString().slice(-6)}`,
            quantity: Number(prodStock),
            unit: prodUnit,
            unitPrice: Number(prodLastPurchasePrice),
            totalAmount: Number(prodStock) * Number(prodLastPurchasePrice),
            createdAt: new Date().toISOString()
          };
          await addDoc(collection(db, "stockLedger"), initialLedger);
        }
      }

      setProductModalOpen(false);
    } catch (err) {
      console.error("Save product item error:", err);
    } finally {
      setSubmittingProduct(false);
    }
  };

  const handleDeleteProduct = async (pId: string, pName: string) => {
    if (!pId) return;
    if (!window.confirm(`Are you absolutely sure you want to delete ${pName}? This destroys catalog indexes.`)) return;
    
    try {
      await deleteDoc(doc(db, "products", pId));
    } catch (err) {
      console.error("Error deleting product item", err);
    }
  };


  /* ==========================================================================
     WORK AREA B: STOCK OUT / DISRUPTION MANAGER (MANUAL & AI ASSISTED)
     ========================================================================== */
  // Manual Stock Out Parameters
  const [selectedStockOutProductId, setSelectedStockOutProductId] = useState("");
  const [stockOutQuantity, setStockOutQuantity] = useState<number>(0);
  const [stockOutReason, setStockOutReason] = useState<"damage" | "sample" | "internal" | "return" | "adjustment">("damage");
  const [stockOutNotes, setStockOutNotes] = useState("");
  const [submittingManualStockOut, setSubmittingManualStockOut] = useState(false);

  // Conversational AI stock-out states
  const [aiStockOutQuery, setAiStockOutQuery] = useState("");
  const [analyzingAiStockOut, setAnalyzingAiStockOut] = useState(false);
  const [aiExtractedAdjustments, setAiExtractedAdjustments] = useState<any[]>([]);
  const [aiExplanation, setAiExplanation] = useState("");

  const handleManualStockOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStockOutProductId || stockOutQuantity <= 0) {
      alert("Please select a product and enter a valid positive quantity.");
      return;
    }

    const matchedProduct = products.find(p => p.id === selectedStockOutProductId);
    if (!matchedProduct) return;

    if (matchedProduct.stock < stockOutQuantity) {
      if (!window.confirm(`WARNING: Stock out request (${stockOutQuantity} units) exceeds available inventory in stock (${matchedProduct.stock} units). Proceeding will drive stock levels negative. Proceed?`)) {
        return;
      }
    }

    setSubmittingManualStockOut(true);
    try {
      const reduction = Number(stockOutQuantity);
      
      // Update inventory product stock
      await updateDoc(doc(db, "products", selectedStockOutProductId), {
        stock: increment(-reduction),
        updatedAt: new Date().toISOString()
      });

      // Register companion step stock ledger log
      const logEntry: StockLedgerEntry = {
        productId: selectedStockOutProductId,
        productName: matchedProduct.name,
        date: new Date().toISOString().split("T")[0],
        type: "adjustment",
        refNo: `STK-OUT-${Date.now().toString().slice(-6)}`,
        quantity: reduction,
        unit: matchedProduct.unit || "units",
        unitPrice: matchedProduct.lastPurchasePrice || 0,
        totalAmount: reduction * (matchedProduct.lastPurchasePrice || 0),
        notes: `Manual Stock Out: ${stockOutReason.toUpperCase()}. ${stockOutNotes}`.trim(),
        createdAt: new Date().toISOString()
      };
      await addDoc(collection(db, "stockLedger"), logEntry);

      // Clean local inputs
      setStockOutQuantity(0);
      setStockOutNotes("");
      alert(`Successfully registered stock-out of ${reduction} ${matchedProduct.unit} for ${matchedProduct.name}.`);
    } catch (err) {
      console.error("Manual stock out subtraction error:", err);
    } finally {
      setSubmittingManualStockOut(false);
    }
  };

  const handleAiStockOutAnalysis = async () => {
    if (!aiStockOutQuery.trim()) {
      alert("Please type some notes describing what got stocked out or damaged.");
      return;
    }

    setAnalyzingAiStockOut(true);
    setAiExtractedAdjustments([]);
    setAiExplanation("");

    try {
      // Map simplified catalogs to aid parsing matches
      const compactCatalogForAi = products.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        currentStock: p.stock,
        unit: p.unit,
        lastPurchasePrice: p.lastPurchasePrice
      }));

      const res = await fetch("/api/gemini/parse-stockout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: aiStockOutQuery,
          catalog: compactCatalogForAi
        })
      });

      if (!res.ok) throw new Error("API call failed");
      const data = await res.json();

      if (data.adjustments) {
        setAiExtractedAdjustments(data.adjustments);
      }
      if (data.explanation) {
        setAiExplanation(data.explanation);
      }
    } catch (err) {
      console.error("AI parse stockout failed", err);
      alert("AI was unable to complete the analysis. Please verify your GEMINI_API_KEY in Secrets or try manual adjustments.");
    } finally {
      setAnalyzingAiStockOut(false);
    }
  };

  const handleApplyAiStockOuts = async () => {
    if (aiExtractedAdjustments.length === 0) return;
    
    let appliedCount = 0;
    try {
      for (const adj of aiExtractedAdjustments) {
        if (!adj.productId || adj.quantity <= 0) continue;

        const matchedProduct = products.find(p => p.id === adj.productId);
        if (!matchedProduct) continue;

        const reduction = Number(adj.quantity);
        
        await updateDoc(doc(db, "products", adj.productId), {
          stock: increment(-reduction),
          updatedAt: new Date().toISOString()
        });

        const logEntry: StockLedgerEntry = {
          productId: adj.productId,
          productName: matchedProduct.name,
          date: new Date().toISOString().split("T")[0],
          type: "adjustment",
          refNo: `AI-STK-${Date.now().toString().slice(-6)}`,
          quantity: reduction,
          unit: matchedProduct.unit || "units",
          unitPrice: matchedProduct.lastPurchasePrice || 0,
          totalAmount: reduction * (matchedProduct.lastPurchasePrice || 0),
          notes: `AI Extracted Adjustment: ${adj.reason || "Automatic extraction"}. Confidence matches: ${adj.confidence}%`,
          createdAt: new Date().toISOString()
        };
        await addDoc(collection(db, "stockLedger"), logEntry);
        appliedCount++;
      }

      setAiExtractedAdjustments([]);
      setAiStockOutQuery("");
      alert(`Successfully processed and committed ${appliedCount} AI-extracted stock reductions to the database.`);
    } catch (err) {
      console.error("Failed executing AI bulk inventory reduction sequence:", err);
    }
  };


  /* ==========================================================================
     WORK AREA C: AI PROCUREMENT AND SOURCING PRICE SPLITTER
     ========================================================================== */
  // Sourcing computation state parameters
  const [calculationPrompt, setCalculationPrompt] = useState(
    "Bought 150 rolls of Golden fabric for 30,000 BDT and 80 rolls of Blue lace yarn for 12,000 BDT from supplier. Transport cost BDT 2,500, packing BDT 700. Add proportionate loading costs."
  );
  const [computingAllocation, setComputingAllocation] = useState(false);
  const [allocatedItems, setAllocatedItems] = useState<any[]>([]);
  const [totalCostSummary, setTotalCostSummary] = useState<any | null>(null);

  const handleAiCostAllocation = async () => {
    if (!calculationPrompt.trim()) return;

    setComputingAllocation(true);
    setAllocatedItems([]);
    setTotalCostSummary(null);

    try {
      const res = await fetch("/api/gemini/calculate-purchase-split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: calculationPrompt })
      });

      if (!res.ok) throw new Error("Split analysis failed");
      const data = await res.json();

      if (data.items) {
        setAllocatedItems(data.items);
      }
      if (data.summary) {
        setTotalCostSummary(data.summary);
      }
    } catch (err) {
      console.error("AI sourcing split calculation failed", err);
      alert("Failed to compute costs using Gemini AI. Please check server connections and API setups.");
    } finally {
      setComputingAllocation(false);
    }
  };

  const handleCopyNewPurchasePrice = (productName: string, computedPrice: number) => {
    const matched = products.find(p => p.name.toLowerCase() === productName.toLowerCase());
    if (matched && matched.id) {
      if (window.confirm(`Update recorded baseline last purchase price of ${matched.name} to ৳${computedPrice.toFixed(2)}?`)) {
        updateDoc(doc(db, "products", matched.id), {
          lastPurchasePrice: computedPrice,
          updatedAt: new Date().toISOString()
        }).then(() => alert("Sourcing purchase price saved into dynamic product catalog."));
      }
    } else {
      // Prompt user to match with a catalog item manually
      alert(`Could not find a direct perfect matches for item named "${productName}" in your product catalog. Please create the item first or match in Edit component.`);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner section */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-slate-800 opacity-20 rounded-full filter blur-xl pointer-events-none"></div>
        <div className="space-y-2 z-10">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-green-500/20 text-green-400 font-extrabold text-[10px] tracking-widest rounded-full uppercase">Dynamic Registry</span>
            <span className="px-3 py-1 bg-indigo-500/20 text-indigo-400 font-extrabold text-[10px] tracking-widest rounded-full uppercase flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> AI Augmented
            </span>
          </div>
          <h2 className="text-2xl font-black tracking-tight font-sans">Corporate Inventory and Stocks Hub</h2>
          <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
            Fully dynamic item listing integrated with manual/AI-driven cost analysis, intelligent bulk damage stock-outs, and custom proportion cost calculators.
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-extrabold uppercase text-xs tracking-wider py-3.5 px-6 rounded-2xl shadow-xl transition-all flex items-center gap-2 cursor-pointer border border-transparent self-stretch md:self-auto text-center justify-center shrink-0 z-10"
        >
          <Plus className="w-4.5 h-4.5 text-black font-extrabold" />
          Catalog New Product
        </button>
      </div>

      {/* Aggregate KPI Stats Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Card 1: Asset Value */}
        <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-100 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-widest block font-sans">STOCKS VALUE WORTH</span>
            <span className="text-xl font-black text-slate-900 font-mono">৳ {totalValuation.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            <span className="text-[10px] text-green-500 font-bold block">Physical balance capital</span>
          </div>
          <div className="p-3.5 bg-green-50 text-green-600 rounded-2xl shrink-0">
            <Wallet className="w-5.5 h-5.5" />
          </div>
        </div>

        {/* Card 2: Catalog Items */}
        <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-100 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-widest block font-sans">PRODUCT DIVERSITY</span>
            <span className="text-2xl font-black text-slate-800 font-sans">{uniqueProductCount} <span className="text-xs text-slate-400 font-semibold">SKUs cataloged</span></span>
            <span className="text-[10px] text-indigo-500 font-bold block">Available product species</span>
          </div>
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl shrink-0">
            <Boxes className="w-5.5 h-5.5" />
          </div>
        </div>

        {/* Card 3: Low Stock Warnings */}
        <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-100 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-widest block font-sans">LOW STOCK LEVELS</span>
            <span className="text-2xl font-black text-amber-600 font-sans">{lowStockCount} <span className="text-xs text-amber-500 font-semibold">alerts</span></span>
            <span className="text-[10px] text-amber-600 font-bold block">Stock balance ≤ 10 units</span>
          </div>
          <div className="p-3.5 bg-amber-50 text-amber-600 rounded-2xl shrink-0">
            <AlertCircle className="w-5.5 h-5.5" />
          </div>
        </div>

        {/* Card 4: Out of Stock */}
        <div className="bg-white p-5 rounded-3xl shadow-xs border border-slate-100 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-widest block font-sans">EMPTY DEFICIT ITEMS</span>
            <span className="text-2xl font-black text-red-650 font-sans">{outOfStockCount} <span className="text-xs text-slate-400 font-semibold">SKUs empty</span></span>
            <span className="text-[10px] text-red-500 font-bold block">Action required: Procurment</span>
          </div>
          <div className="p-3.5 bg-red-50 text-red-600 rounded-2xl shrink-0">
            <Package className="w-5.5 h-5.5" />
          </div>
        </div>
      </div>

      {/* Sub Tabs control panel */}
      <div className="flex border-b border-slate-100 space-x-1 p-1 bg-slate-100 rounded-2xl max-w-md">
        <button
          onClick={() => setActiveSubTab("catalog")}
          className={cn(
            "flex-1 py-2.5 px-4 rounded-xl text-xs font-bold uppercase transition-all tracking-wider flex items-center justify-center gap-1.5 cursor-pointer",
            activeSubTab === "catalog" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
          )}
        >
          <ClipboardList className="w-4 h-4" />
          Stocks Registry
        </button>
        <button
          onClick={() => setActiveSubTab("stockout")}
          className={cn(
            "flex-1 py-2.5 px-4 rounded-xl text-xs font-bold uppercase transition-all tracking-wider flex items-center justify-center gap-1.5 cursor-pointer",
            activeSubTab === "stockout" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
          )}
        >
          <ArrowRightLeft className="w-4 h-4" />
          Stock Out Manager
        </button>
        <button
          onClick={() => setActiveSubTab("calculator")}
          className={cn(
            "flex-1 py-2.5 px-4 rounded-xl text-xs font-bold uppercase transition-all tracking-wider flex items-center justify-center gap-1.5 cursor-pointer",
            activeSubTab === "calculator" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
          )}
        >
          <Calculator className="w-4 h-4" />
          AI Cost Separator
        </button>
      </div>

      {/* Dynamic Workspace Container view */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeSubTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          {/* TAB 1: PRODUCT CATALOG */}
          {activeSubTab === "catalog" && (
            <div className="space-y-6">
              {/* Filter Row */}
              <div className="bg-white p-6 rounded-3xl shadow-xs border border-slate-150 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1 max-w-md relative">
                  <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400 font-semibold" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search commodities, yarn species, or fabric categories..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Category:</span>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="border border-slate-200 bg-white rounded-xl py-2 px-3.5 text-xs font-bold focus:outline-none"
                    >
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat === "all" ? "All Categories" : cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="flex items-center gap-2 py-2 px-3.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-150 cursor-pointer text-xs font-bold select-none text-slate-700">
                    <input
                      type="checkbox"
                      checked={lowStockFilter}
                      onChange={(e) => setLowStockFilter(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    Low Stock Alerts
                  </label>
                </div>
              </div>

              {/* Items Card Grid */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl border border-slate-100">
                  <Loader2 className="w-8 h-8 text-slate-800 animate-spin" />
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-3">Sifting inventory logs...</span>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="bg-white border border-slate-100 rounded-3xl p-16 text-center shadow-xs">
                  <PackagingIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-1">No Matching Stock Items</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    We couldn't locate any products matching your active criteria. Create a new product to get started.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {filteredProducts.map((p) => {
                    const valuation = (p.stock || 0) * (p.lastPurchasePrice || 0);
                    const isLow = (p.stock || 0) <= 10 && (p.stock || 0) > 0;
                    const isEmpty = (p.stock || 0) === 0;

                    return (
                      <div 
                        key={p.id}
                        className={cn(
                          "bg-white rounded-3xl p-5 border shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between space-y-4 font-sans relative overflow-hidden group",
                          isEmpty ? "border-red-150 bg-red-50/5" : isLow ? "border-amber-150 bg-amber-50/5" : "border-slate-100"
                        )}
                      >
                        {/* Tags or critical signals */}
                        <div className="flex items-start justify-between">
                          <span className="px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 text-[9px] font-black uppercase tracking-wider">
                            {p.category}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEditModal(p)}
                              className="p-1 px-1.5 hover:bg-slate-50 text-slate-600 hover:text-slate-900 rounded-lg border border-transparent hover:border-slate-150 transition-all cursor-pointer"
                              title="Modify product details or stock counts"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(p.id!, p.name)}
                              className="p-1 px-1.5 hover:bg-red-50 text-red-500 hover:text-red-700 rounded-lg border border-transparent hover:border-red-100 transition-all cursor-pointer"
                              title="Erase SKU entry completely"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Middle metadata blocks */}
                        <div className="space-y-1">
                          <h4 className="text-sm font-black text-slate-900 tracking-tight group-hover:text-indigo-600 transition-colors">
                            {p.name}
                          </h4>
                          {p.subCategory && (
                            <span className="text-[10px] text-slate-400 font-bold font-sans uppercase block">
                              Sub Category: {p.subCategory}
                            </span>
                          )}
                        </div>

                        {/* Stock Balance details */}
                        <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                          <div>
                            <span className="text-[8.5px] font-black uppercase text-slate-400 tracking-wider block">Quantity</span>
                            <span className={cn(
                              "text-xs font-black font-mono",
                              isEmpty ? "text-red-600" : isLow ? "text-amber-600" : "text-green-700"
                            )}>
                              {p.stock} <span className="text-[10px] font-semibold text-slate-400">{p.unit}</span>
                            </span>
                          </div>
                          <div>
                            <span className="text-[8.5px] font-black uppercase text-slate-400 tracking-wider block">Sourcing Unit Cost</span>
                            <span className="text-xs font-bold font-mono text-slate-800">
                              ৳{p.lastPurchasePrice || 0}
                            </span>
                          </div>
                        </div>

                        {/* Calculated Net Value worth */}
                        <div className="border-t border-slate-100/80 pt-3.5 flex items-center justify-between">
                          <div>
                            <span className="text-[9px] font-extrabold uppercase text-slate-400 tracking-widest block leading-none">Net Cost Valuation</span>
                            <span className="text-[13px] font-black text-slate-900 font-mono mt-1 block">
                              ৳ {valuation.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          {isEmpty ? (
                            <span className="px-2 py-0.5 rounded-lg bg-red-100 text-red-700 text-[8.5px] font-black uppercase tracking-widest">
                              Deficit
                            </span>
                          ) : isLow ? (
                            <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 text-[8.5px] font-black uppercase tracking-widest">
                              Restock Alert
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-lg bg-green-100 text-green-700 text-[8.5px] font-black uppercase tracking-widest">
                              Ok in stock
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}


          {/* TAB 2: STOCK OUT / DISRUPTION CONTROLLER */}
          {activeSubTab === "stockout" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Section Left: Manual Action Entry */}
              <div className="bg-white p-6 rounded-3xl border border-slate-150 shadow-2xs space-y-5">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-black uppercase text-slate-800 tracking-wider">Manual Stock-Out Registration</h3>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mt-0.5">Erase inventory items for damage or sample giveaways</p>
                </div>

                <form onSubmit={handleManualStockOut} className="space-y-4">
                  {/* Product Selector */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Select Product to Adjust</label>
                    <select
                      value={selectedStockOutProductId}
                      onChange={(e) => setSelectedStockOutProductId(e.target.value)}
                      required
                      className="w-full p-2.5 text-xs font-bold rounded-xl border border-gray-200 bg-slate-50 focus:outline-none"
                    >
                      <option value="">-- Choose Catalog SKU --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (Current Stock: {p.stock} {p.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Size Adjustment count */}
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Quantity to Stock-Out</label>
                      <input
                        type="number"
                        min="1"
                        value={stockOutQuantity || ""}
                        onChange={(e) => setStockOutQuantity(Number(e.target.value))}
                        required
                        placeholder="Qty to deduct"
                        className="w-full p-2.5 text-xs font-semibold rounded-xl border border-gray-200 bg-slate-50 focus:outline-none"
                      />
                    </div>

                    {/* Stock out Type reason */}
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Disruption Reason</label>
                      <select
                        value={stockOutReason}
                        onChange={(e) => setStockOutReason(e.target.value as any)}
                        className="w-full p-2.5 text-xs font-bold rounded-xl border border-gray-200 bg-slate-50"
                      >
                        <option value="damage">Damage / Wet Damage</option>
                        <option value="sample">Client Sample Issue</option>
                        <option value="internal">Internal Store Usage</option>
                        <option value="return">Returned back to Sourcing</option>
                        <option value="adjustment">Stock Audit Correction</option>
                      </select>
                    </div>
                  </div>

                  {/* Notes description */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Descriptive Notes</label>
                    <textarea
                      value={stockOutNotes}
                      onChange={(e) => setStockOutNotes(e.target.value)}
                      placeholder="Input damage cause or receiver client's name..."
                      rows={3}
                      className="w-full p-2.5 text-xs font-semibold rounded-xl border border-gray-200 bg-slate-50 focus:outline-none"
                    ></textarea>
                  </div>

                  <button
                    type="submit"
                    disabled={submittingManualStockOut}
                    className="w-full py-3 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {submittingManualStockOut ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4" />
                    )}
                    Erase Stock Account
                  </button>
                </form>
              </div>

              {/* Section Right: Conversational AI-Intelligent Extraction assistant! */}
              <div className="bg-white p-6 rounded-3xl border border-slate-150 shadow-2xs space-y-5">
                <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black uppercase text-slate-800 tracking-wider flex items-center gap-1">
                      <Sparkles className="w-4 h-4 text-indigo-500" />
                      AI Conversational Stock-Out Parser
                    </h3>
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mt-0.5">Type messy accounts notes; AI maps items and logs adjustments</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Describe Stock-Out event or Damages</label>
                    <textarea
                      value={aiStockOutQuery}
                      onChange={(e) => setAiStockOutQuery(e.target.value)}
                      placeholder="e.g. 'We threw away 5 pieces of golden fabric that got rain-damaged, andJoy checked out 12 rolls of Tape as a sample for the project.'"
                      rows={4}
                      className="w-full p-3 text-xs font-semibold rounded-xl border border-gray-200 bg-slate-50 focus:outline-none placeholder-slate-400 leading-relaxed font-sans"
                    ></textarea>
                  </div>

                  <button
                    onClick={handleAiStockOutAnalysis}
                    disabled={analyzingAiStockOut || !aiStockOutQuery.trim()}
                    className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-[#d4af37] text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {analyzingAiStockOut ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    Analyze Adjustments with Gemini AI
                  </button>

                  {/* AI Output Display Panel */}
                  <AnimatePresence>
                    {aiExtractedAdjustments.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-4 pt-1 border-t border-slate-100"
                      >
                        <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 space-y-2">
                          <span className="text-[9px] font-black uppercase text-indigo-700 tracking-widest block">AI ANALYSIS SUMMARY EXPLANATION</span>
                          <p className="text-xs text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">{aiExplanation}</p>
                        </div>

                        <div className="space-y-2">
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">PROPOSED INVENTORY SYSTEM DEDUCTIONS:</span>
                          
                          <div className="divide-y divide-slate-100 bg-white border border-slate-150 rounded-2xl overflow-hidden shadow-3xs text-xs font-sans">
                            {aiExtractedAdjustments.map((adj, idx) => (
                              <div key={idx} className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                <div className="space-y-0.5">
                                  <span className="font-extrabold text-slate-850 block">{adj.productName}</span>
                                  <span className="text-[9.5px] text-red-500 font-bold uppercase tracking-wide">
                                    DEDUCT: {adj.quantity} {adj.unit} | Cost Value: ৳{(adj.valueLoss || 0).toFixed(2)}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <span className="px-2 py-0.5 text-[8px] font-black uppercase bg-indigo-100 text-indigo-700 rounded-lg">
                                    {adj.confidence}% product match
                                  </span>
                                  <span className="text-[9.5px] text-slate-400 block font-semibold uppercase font-sans mt-0.5">REASON: {adj.reason}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={handleApplyAiStockOuts}
                          className="w-full py-3 bg-[#22c55e] hover:bg-[#16a34a] text-black text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Check className="w-4 h-4 text-black font-black" />
                          Confirm & Bulk Subtract Stock Level
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {!aiExtractedAdjustments.length && !analyzingAiStockOut && (
                    <div className="p-6 bg-slate-50/60 rounded-2xl text-center border border-slate-100/50">
                      <HelpCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-[11px] text-slate-400 font-semibold">
                        Enter raw notes above (e.g. audit results, damages lists) and the Gemini AI engine will map text descriptions directly to actual catalog items!
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}


          {/* TAB 3: PROPORTION PROCUREMENT AI COST CALCULATOR SCREEN */}
          {activeSubTab === "calculator" && (
            <div className="bg-white p-6 rounded-3xl border border-slate-150 shadow-2xs space-y-6">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-[#d4af37]" />
                  AI Proportion Sourcing Cost Allocation Calculator
                </h3>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mt-0.5">
                  Separate, proportion value-overhead carriage-inward, cargo transport charges, custom packaging fees, and discounts evenly to discover real Item Unit Sourcing Cost
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sourcing details input */}
                <div className="lg:col-span-1 space-y-4 font-sans">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Describe raw invoice/bill details</label>
                    <textarea
                      value={calculationPrompt}
                      onChange={(e) => setCalculationPrompt(e.target.value)}
                      rows={6}
                      placeholder="Enter raw purchase amounts..."
                      className="w-full p-3 text-xs font-semibold rounded-xl border border-gray-200 bg-slate-50 focus:outline-none placeholder-slate-400 leading-relaxed font-sans"
                    ></textarea>
                  </div>

                  <button
                    onClick={handleAiCostAllocation}
                    disabled={computingAllocation || !calculationPrompt.trim()}
                    className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-[#d4af37] text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer border border-transparent"
                  >
                    {computingAllocation ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    Split Cost Allocation with AI
                  </button>

                  <div className="bg-amber-50/40 p-4 rounded-2xl border border-amber-100">
                    <span className="text-[9px] font-black uppercase text-amber-700 tracking-widest block mb-1">💡 CRITICAL USE-CASE</span>
                    <p className="text-[10.5px] text-slate-600 leading-normal font-sans">
                      If you buy fabrics from wholesale suppliers, cargo shipments and packing costs can overstate base prices. 
                      Pasting your totals can let Gemini allocate direct transport costs proportionally based on the values.
                    </p>
                  </div>
                </div>

                {/* Sourcing calculations display */}
                <div className="lg:col-span-2 space-y-5">
                  <AnimatePresence mode="wait">
                    {computingAllocation ? (
                      <div className="flex flex-col items-center justify-center py-20 bg-slate-50 border border-slate-100 rounded-3xl" key="computing">
                        <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
                        <span className="text-xs text-indigo-750 font-black uppercase tracking-widest mt-2">Computing cost divisions...</span>
                      </div>
                    ) : allocatedItems.length > 0 ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-5"
                        key="results"
                      >
                        {totalCostSummary && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Base Invoice Worth</span>
                              <span className="text-xs font-extrabold font-mono text-slate-705">৳{totalCostSummary.baseTotalBdt}</span>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Overheads / Transport</span>
                              <span className="text-xs font-extrabold font-mono text-slate-705">৳{totalCostSummary.overheadsBdt}</span>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Discounts applied</span>
                              <span className="text-xs font-extrabold font-mono text-slate-500">৳{totalCostSummary.discountsBdt}</span>
                            </div>
                            <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800 text-white">
                              <span className="text-[8px] font-black text-[#d4af37] uppercase tracking-wider block">Combined Audit Sourcing</span>
                              <span className="text-xs font-black font-mono text-white">৳{totalCostSummary.grandTotalBdt}</span>
                            </div>
                          </div>
                        )}

                        <div className="overflow-x-auto border border-slate-150 rounded-2xl bg-white shadow-3xs">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-slate-100 text-[10px] font-extrabold uppercase text-gray-400 tracking-widest bg-slate-50 select-none">
                                <th className="py-2.5 px-4">Item Target</th>
                                <th className="py-2.5 px-4 text-center">Qty Bought</th>
                                <th className="py-2.5 px-4 text-right">Invoice Unit Cash</th>
                                <th className="py-2.5 px-4 text-right">Apportioned Overhead</th>
                                <th className="py-2.5 px-4 text-right">True Net Unit Price</th>
                                <th className="py-2.5 px-4 text-center">Catalog Match Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {allocatedItems.map((item: any, idex) => (
                                <tr key={idex} className="hover:bg-slate-50/50">
                                  <td className="py-3 px-4 font-black text-slate-800">{item.itemName}</td>
                                  <td className="py-3 px-4 text-center font-bold font-mono">{item.quantity}</td>
                                  <td className="py-3 px-4 text-right font-mono text-slate-500">৳{item.baseUnitCostBdt}</td>
                                  <td className="py-3 px-4 text-right font-mono text-green-700 font-semibold">+ ৳{item.overheadFractionBdt}</td>
                                  <td className="py-3 px-4 text-right font-black font-mono text-slate-950">৳{item.calculatedNetUnitCostBdt}</td>
                                  <td className="py-3 px-4 text-center">
                                    <button
                                      onClick={() => handleCopyNewPurchasePrice(item.itemName, item.calculatedNetUnitCostBdt)}
                                      className="py-1 px-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer inline-flex items-center gap-1 border border-indigo-100"
                                    >
                                      <RefreshCw className="w-3 h-3" />
                                      Sync SKU Cost
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-24 bg-slate-50/40 rounded-3xl text-center border border-dashed border-slate-200" key="empty">
                        <Calculator className="w-10 h-10 text-slate-300 mb-2" />
                        <h4 className="text-xs font-extrabold uppercase text-slate-800 tracking-wider">Calculations Registry Empty</h4>
                        <p className="text-[11px] text-slate-400 max-w-sm mt-0.5 leading-relaxed font-semibold">
                          Write down raw purchases invoice records and tap Split Cost Allocation to visualize detailed item cost division!
                        </p>
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* FULL UPGRADE SYSTEM: ADD/EDIT PRODUCT DIALOG POPUP */}
      <AnimatePresence>
        {productModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs min-h-screen">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white max-w-lg w-full rounded-3xl border border-slate-200 shadow-2xl p-6 sm:p-8 space-y-6 relative max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-wider">
                    {editingProduct ? "Modify Product Details" : "Catalog New Product"}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-extrabold uppercase mt-0.5">Maintain system baseline specifications</p>
                </div>
                <button
                  onClick={() => setProductModalOpen(false)}
                  className="p-1.5 hover:bg-slate-150 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveProduct} className="space-y-4 font-sans text-xs">
                {/* Product Name */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black text-slate-400 block">Product Name *</label>
                  <input
                    type="text"
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    required
                    placeholder="e.g. 50S Combed Cotton Thread, Premium Silk Ribbon"
                    className="w-full p-2.5 border border-slate-200 bg-slate-50 focus:bg-white rounded-xl focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Category */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-black text-slate-400 block">Category *</label>
                    <input
                      type="text"
                      value={prodCategory}
                      onChange={(e) => setProdCategory(e.target.value)}
                      required
                      placeholder="e.g. Cotton, Lace, Silk Yarn"
                      className="w-full p-2.5 border border-slate-200 bg-slate-50 focus:bg-white rounded-xl focus:outline-none"
                    />
                  </div>

                  {/* Sub-Category */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-black text-slate-400 block">Sub-Category</label>
                    <input
                      type="text"
                      value={prodSubCategory}
                      onChange={(e) => setProdSubCategory(e.target.value)}
                      placeholder="e.g. Combed, Spun Thread"
                      className="w-full p-2.5 border border-slate-200 bg-slate-50 focus:bg-white rounded-xl focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Unit Type */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-black text-slate-400 block">Stock Unit *</label>
                    <select
                      value={prodUnit}
                      onChange={(e) => setProdUnit(e.target.value)}
                      required
                      className="w-full p-2.5 border border-slate-200 bg-slate-50 focus:bg-white rounded-xl focus:outline-none"
                    >
                      <option value="Roll">Roll</option>
                      <option value="Yard">Yard</option>
                      <option value="Meter">Meter</option>
                      <option value="Piece">Piece</option>
                      <option value="Pair">Pair</option>
                      <option value="Dozen">Dozen</option>
                    </select>
                  </div>

                  {/* Stock Quantity */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-black text-slate-400 block">Initial / New Stock Qty *</label>
                    <input
                      type="number"
                      value={prodStock}
                      onChange={(e) => setProdStock(Number(e.target.value))}
                      required
                      min="0"
                      className="w-full p-2.5 border border-slate-200 bg-slate-50 focus:bg-white rounded-xl focus:outline-none"
                    />
                  </div>

                  {/* Last Purchase Price */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-black text-slate-400 block">Sourcing Unit Price (BDT) *</label>
                    <input
                      type="number"
                      value={prodLastPurchasePrice}
                      onChange={(e) => setProdLastPurchasePrice(Number(e.target.value))}
                      required
                      min="0"
                      className="w-full p-2.5 border border-slate-200 bg-slate-50 focus:bg-white rounded-xl focus:outline-none"
                    />
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-end gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setProductModalOpen(false)}
                    className="py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold uppercase transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingProduct}
                    className="py-2.5 px-5 bg-slate-905 hover:bg-slate-950 text-white font-black uppercase rounded-xl transition shadow-md flex items-center gap-1 cursor-pointer bg-slate-900"
                  >
                    {submittingProduct && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Save Commodity item
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Compact custom vector layout decorations
function PackagingIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      {...props}
    >
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}
