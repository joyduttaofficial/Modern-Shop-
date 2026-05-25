import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy, getDocs } from "firebase/firestore";
import { db, OperationType, handleFirestoreError } from "@/src/lib/firebase";
import { UserProfile, RolePermission } from "@/src/types";
import { cn } from "@/src/lib/utils";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut } from "firebase/auth";
import firebaseConfig from "@/firebase-applet-config.json";
import { 
  Users, Plus, Trash2, Shield, UserCheck, X, Search, Check, Pencil, 
  Mail, Phone, Briefcase, ChevronRight, UserCircle, ShieldAlert, BadgeCheck,
  FileText, ArrowLeft, Camera, LayoutGrid, Award, CheckSquare, Square
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const SYSTEM_MENUS = [
  {
    category: "General",
    items: [
      { id: "dashboard", name: "Dashboard", description: "Main stats & overview pane" },
      { id: "transactions", name: "Transactions Ledger", description: "Manage cash & bank transaction flows" },
      { id: "reports", name: "Reports & PDFs", description: "Generate daily statements and PDF reports" },
      { id: "settings", name: "Settings Pane", description: "Global shop setting adjustments" }
    ]
  },
  {
    category: "Sales Hub",
    items: [
      { id: "newSale", name: "New Sale Entry", description: "Create customer invoice & POS entry" },
      { id: "salesList", name: "Sales List / Ledger", description: "View of all invoices & bills" }
    ]
  },
  {
    category: "采购部 Procurement",
    items: [
      { id: "newPurchase", name: "New Procurement", description: "Enter raw materials/goods purchase" },
      { id: "purchaseList", name: "Bills & Purchase List", description: "View purchasing register & suppliers dues" }
    ]
  },
  {
    category: "Suppliers",
    items: [
      { id: "newSupplier", name: "New Supplier Info", description: "Onboard new wholesale entities" },
      { id: "suppliersList", name: "Suppliers Ledger", description: "Manage balances, dues & histories" }
    ]
  },
  {
    category: "Employees",
    items: [
      { id: "newEmployee", name: "Add New Employee", description: "Register staff & salary settings" },
      { id: "employeesList", name: "Registered Staff", description: "Employee roster and profiles" },
      { id: "salaryEntry", name: "Disburse Salary", description: "Record salary payments & advance payments" },
      { id: "salarySheet", name: "Monthly Ledger", description: "Summary payroll sheets" }
    ]
  },
  {
    category: "Attendance Tracker",
    items: [
      { id: "addAttendance", name: "Daily Input", description: "Record daily clock-in/check-ins" },
      { id: "attendanceList", name: "Attendance Book", description: "Staff attendance history register" }
    ]
  },
  {
    category: "User Management (Admin Only)",
    items: [
      { id: "newUser", name: "New User Provisioning", description: "Pre-register and invite users" },
      { id: "usersList", name: "Users Directory", description: "Manage system access and status" },
      { id: "rolesList", name: "Roles & Permissions", description: "Access level & custom permission designer" }
    ]
  }
];

// Flat menus for convenient lookup
const ALL_MENU_IDS = SYSTEM_MENUS.flatMap(cat => cat.items.map(item => item.id));

export default function UsersManager({
  user,
  role,
  activeSubView = "usersList",
  onSelectView,
  onProfileUpdated
}: {
  user: User;
  role: string;
  activeSubView?: "newUser" | "usersList" | "rolesList" | "profileView";
  onSelectView?: (view: string) => void;
  onProfileUpdated?: () => void;
}) {
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const cleanEmailDisplay = (email: string) => {
    if (!email) return "";
    let display = email;
    if (display.endsWith("@modernmanager.com")) {
      display = display.replace("@modernmanager.com", "");
    } else if (display.endsWith("@modernmanager.local")) {
      display = display.replace("@modernmanager.local", "");
    }
    return display;
  };
  const [roles, setRoles] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states for creating/editing users
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userDisplayName, setUserDisplayName] = useState("");
  const [userRole, setUserRole] = useState("sales");
  const [userPhotoURL, setUserPhotoURL] = useState("");
  const [userMobile, setUserMobile] = useState("");
  const [userDesignation, setUserDesignation] = useState("");
  const [userDepartment, setUserDepartment] = useState("");
  const [userBio, setUserBio] = useState("");
  const [userStatus, setUserStatus] = useState<"active" | "inactive">("active");

  // Form states for Roles Creators
  const [roleFormOpen, setRoleFormOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RolePermission | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [roleAllowedMenus, setRoleAllowedMenus] = useState<string[]>([]);

  // Search filter
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [deleteConfirmUserId, setDeleteConfirmUserId] = useState<string | null>(null);
  const [deleteConfirmRoleId, setDeleteConfirmRoleId] = useState<string | null>(null);

  useEffect(() => {
    // Listen for roles
    const unsubRoles = onSnapshot(collection(db, "roles"), (snap) => {
      const parsedRoles: RolePermission[] = [];
      snap.forEach((doc) => {
        parsedRoles.push({ id: doc.id, ...doc.data() } as RolePermission);
      });
      setRoles(parsedRoles);
    }, (err) => {
      console.error(err);
    });

    // Listen for user profiles
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const parsedUsers: UserProfile[] = [];
      snap.forEach((doc) => {
        parsedUsers.push({ id: doc.id, ...doc.data() } as UserProfile);
      });
      setUsersList(parsedUsers);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    return () => {
      unsubRoles();
      unsubUsers();
    };
  }, []);

  // When changing tab/subview from parent
  useEffect(() => {
    if (activeSubView === "newUser") {
      setEditingUser(null);
      clearUserForm();
      setUserFormOpen(true);
    } else if (activeSubView === "profileView") {
      // Find logged-in user profile
      const selfProfile = usersList.find(u => u.uid === user.uid || u.email.toLowerCase() === user.email?.toLowerCase());
      if (selfProfile) {
        setSelectedProfile(selfProfile);
      }
    } else {
      setUserFormOpen(false);
    }
  }, [activeSubView, usersList, user]);

  const clearUserForm = () => {
    setUserEmail("");
    setUserPassword("");
    setUserDisplayName("");
    setUserRole("sales");
    setUserPhotoURL("");
    setUserMobile("");
    setUserDesignation("");
    setUserDepartment("");
    setUserBio("");
    setUserStatus("active");
    setEditingUser(null);
    setErrorMsg("");
  };

  const clearRoleForm = () => {
    setRoleName("");
    setRoleDescription("");
    setRoleAllowedMenus([]);
    setEditingRole(null);
    setErrorMsg("");
  };

  const handleCreateOrUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!userEmail.trim() || !userDisplayName.trim()) {
      setErrorMsg("Display Name and User ID/Email are required.");
      return;
    }

    if (!editingUser && !userPassword.trim()) {
      setErrorMsg("A password is required when creating a new user.");
      return;
    }

    const emailKey = userEmail.trim().toLowerCase();
    const finalEmail = emailKey.includes("@") ? emailKey : `${emailKey}@modernmanager.com`;

    if (editingUser && editingUser.email?.toLowerCase() === "modern@admin.com" && user.email?.toLowerCase() !== "modern@admin.com") {
      setErrorMsg("Only the main Administrator themselves can modify their own credentials or profile.");
      return;
    }

    try {
      const cleanUsername = emailKey.includes("@") ? emailKey.split("@")[0] : emailKey;
      let docId = editingUser?.id || `user-${Date.now()}`;
      
      // If a user with this email/username already has a record (to prevent duplicates)
      const existingWithEmail = usersList.find(u => 
        (u.email.toLowerCase() === finalEmail || (u.username && u.username.toLowerCase() === cleanUsername)) && 
        u.id !== editingUser?.id
      );
      if (existingWithEmail) {
        setErrorMsg("A user profile with this User ID or Email address already exists.");
        return;
      }

      // If they provide no avatar icon, we generate a high-quality human layout from dicebear/ui-avatars
      const defaultPhoto = userPhotoURL.trim() || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(userDisplayName)}`;

      if (!editingUser) {
        // Create full user auth in background using a secondary Firebase app so we don't log the admin out!
        const tempAppName = `app-${Date.now()}`;
        const tempApp = initializeApp(firebaseConfig, tempAppName);
        const tempAuth = getAuth(tempApp);
        try {
          const userCred = await createUserWithEmailAndPassword(tempAuth, finalEmail, userPassword.trim());
          if (userCred.user) {
            await updateProfile(userCred.user, {
              displayName: userDisplayName.trim(),
              photoURL: defaultPhoto
            });
            await signOut(tempAuth);
          }
        } catch (authErr: any) {
          console.error("Secondary app registration failed:", authErr);
          const msg = authErr?.message || "";
          if (!msg.includes("email-already-in-use")) {
            setErrorMsg("Failed to create credential: " + msg);
            await deleteApp(tempApp);
            return;
          }
        }
        await deleteApp(tempApp);
      }

      const profilePayload: UserProfile = {
        email: finalEmail,
        username: cleanUsername,
        displayName: finalEmail === "modern@admin.com" ? "Main Administrator" : userDisplayName.trim(),
        role: finalEmail === "modern@admin.com" ? "admin" : userRole,
        photoURL: defaultPhoto,
        mobile: userMobile.trim(),
        designation: userDesignation.trim(),
        department: userDepartment.trim(),
        bio: userBio.trim(),
        status: finalEmail === "modern@admin.com" ? "active" : userStatus,
        createdAt: editingUser?.createdAt || new Date().toISOString(),
        ...(userPassword.trim() ? { password: userPassword.trim() } : (editingUser?.password ? { password: editingUser.password } : {})),
        ...(editingUser?.uid ? { uid: editingUser.uid } : {})
      };

      await setDoc(doc(db, "users", docId), profilePayload);
      setSuccessMsg(`User profile for "${userDisplayName}" ${editingUser ? "updated" : "created"} successfully!`);
      
      if (onProfileUpdated && editingUser?.uid === user.uid) {
        onProfileUpdated();
      }

      setTimeout(() => {
        setSuccessMsg("");
        setUserFormOpen(false);
        clearUserForm();
        if (onSelectView) onSelectView("usersList");
      }, 1500);

    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "users");
    }
  };

  const handleCreateOrUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!roleName.trim()) {
      setErrorMsg("Role Name is required.");
      return;
    }

    const cleanRoleId = editingRole?.id || roleName.toLowerCase().replace(/[^a-z0-9]/g, "-");

    try {
      const rolePayload: RolePermission = {
        name: roleName.trim(),
        description: roleDescription.trim(),
        allowedMenus: roleAllowedMenus,
        createdAt: editingRole?.createdAt || new Date().toISOString()
      };

      await setDoc(doc(db, "roles", cleanRoleId), rolePayload);
      setSuccessMsg(`Role configuration for "${roleName}" saved successfully!`);
      
      setTimeout(() => {
        setSuccessMsg("");
        setRoleFormOpen(false);
        clearRoleForm();
      }, 1500);

    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "roles");
    }
  };

  const handleDeleteUser = async (profileId: string) => {
    // Check if user is the main administrator
    const targetUser = usersList.find(u => u.id === profileId || u.uid === profileId);
    if (targetUser && targetUser.email?.toLowerCase() === "modern@admin.com") {
      setErrorMsg("The main system Administrator (modern@admin.com) cannot be deleted under any circumstances.");
      setDeleteConfirmUserId(null);
      setTimeout(() => setErrorMsg(""), 3000);
      return;
    }

    try {
      await deleteDoc(doc(db, "users", profileId));
      setSuccessMsg("User profile deleted successfully.");
      setDeleteConfirmUserId(null);
      if (selectedProfile?.id === profileId) {
        setSelectedProfile(null);
      }
      setTimeout(() => setSuccessMsg(""), 2000);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "users");
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (roleId === "admin" || roleId === "accountant" || roleId === "sales") {
      setErrorMsg("Built-in roles (admin, accountant, sales) cannot be deleted as they serve as system infrastructure keys.");
      setTimeout(() => setErrorMsg(""), 4000);
      return;
    }
    try {
      await deleteDoc(doc(db, "roles", roleId));
      setSuccessMsg("Role configuration deleted.");
      setDeleteConfirmRoleId(null);
      setTimeout(() => setSuccessMsg(""), 2000);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "roles");
    }
  };

  const toggleMenuPermissions = (menuId: string) => {
    setRoleAllowedMenus(prev => 
      prev.includes(menuId) 
        ? prev.filter(id => id !== menuId)
        : [...prev, menuId]
    );
  };

  const toggleAllCategoryMenus = (menuIds: string[], checked: boolean) => {
    if (checked) {
      setRoleAllowedMenus(prev => Array.from(new Set([...prev, ...menuIds])));
    } else {
      setRoleAllowedMenus(prev => prev.filter(id => !menuIds.includes(id)));
    }
  };

  // Helper to resolve custom role details
  const getRoleDisplayName = (roleId: string) => {
    if (roleId === "admin") return "Administrator";
    if (roleId === "accountant") return "Senior Accountant";
    if (roleId === "sales") return "Sales Agent";
    const customRole = roles.find(r => r.id === roleId);
    return customRole ? customRole.name : roleId.toUpperCase();
  };

  const filteredUsers = usersList.filter(u => 
    u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.designation && u.designation.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header and alerts */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-8 h-8 text-slate-800" />
            {activeSubView === "newUser" && "Provision Access"}
            {activeSubView === "usersList" && "Staff Directory & Access"}
            {activeSubView === "rolesList" && "Dynamic Role Architect"}
            {activeSubView === "profileView" && "My Profile Card"}
          </h1>
          <p className="text-slate-500 font-medium text-sm">
            Configure beautiful staff credentials, assign custom allowed menus, and manage system authorization.
          </p>
        </div>

        {/* Action button inside users list */}
        {activeSubView === "usersList" && role === "admin" && (
          <button
            onClick={() => {
              clearUserForm();
              setUserFormOpen(true);
            }}
            className="px-5 py-3 bg-slate-950 text-white hover:bg-slate-800 active:scale-95 text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-slate-950/10 flex items-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add User Account
          </button>
        )}

        {/* Action button inside roles list */}
        {activeSubView === "rolesList" && role === "admin" && (
          <button
            onClick={() => {
              clearRoleForm();
              setRoleFormOpen(true);
            }}
            className="px-5 py-3 bg-indigo-950 text-white hover:bg-indigo-900 active:scale-95 text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-950/10 flex items-center gap-2 transition-all cursor-pointer"
          >
            <Shield className="w-4 h-4 text-indigo-400" /> Create Custom Role
          </button>
        )}
      </div>

      {successMsg && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 bg-teal-50 text-teal-800 border border-teal-150 rounded-2xl font-semibold text-sm">
          {successMsg}
        </motion.div>
      )}

      {errorMsg && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 bg-rose-50 text-rose-800 border border-rose-150 rounded-2xl font-semibold text-sm">
          {errorMsg}
        </motion.div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center p-20 bg-white border border-slate-100 rounded-3xl shadow-sm text-slate-400 font-bold">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900 mb-4" />
          Synchronizing User Management databases...
        </div>
      ) : (
        <>
          {/* ==================== 1. NEW USER FORM / EDIT USER (MODAL OR EMBEDDED) ==================== */}
          {userFormOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white border border-slate-200/90 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-slate-950" />
              <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-slate-100 rounded-xl text-slate-800">
                    <UserCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="font-extrabold text-slate-800 text-lg">
                      {editingUser ? "Edit User Record" : "Pre-Register / Invite New Employee"}
                    </h2>
                    <p className="text-xs text-slate-400 font-semibold">
                      This user will inherit exact matched roles upon their first Google Auth login.
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setUserFormOpen(false);
                    clearUserForm();
                  }}
                  className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateOrUpdateUser} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Display Name *</label>
                    <input
                      type="text"
                      required
                      value={userDisplayName}
                      onChange={(e) => setUserDisplayName(e.target.value)}
                      placeholder="e.g. Joy Dutta"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-slate-800 focus:bg-white rounded-xl font-medium outline-none transition-all text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">User ID (Username) or Email *</label>
                    <input
                      type="text"
                      required
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      placeholder="e.g. johndoe or user@company.com"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-slate-800 focus:bg-white rounded-xl font-medium outline-none transition-all text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={!!editingUser}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                      {editingUser ? "Update Password (Optional)" : "Security Password *"}
                    </label>
                    <input
                      type="text"
                      required={!editingUser}
                      value={userPassword}
                      onChange={(e) => setUserPassword(e.target.value)}
                      placeholder={editingUser ? "Leave blank to keep current password" : "Minimum 6 characters"}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-slate-800 focus:bg-white rounded-xl font-medium outline-none transition-all text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Role Access Permission *</label>
                    <select
                      value={userRole}
                      onChange={(e) => setUserRole(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-slate-800 focus:bg-white rounded-xl font-medium outline-none transition-all text-sm"
                    >
                      <optgroup label="Core Standard Roles">
                        <option value="admin">Administrator (Full Access)</option>
                        <option value="accountant">Accountant Ledger Agent</option>
                        <option value="sales">Sales Hub Staff</option>
                      </optgroup>
                      {roles.length > 0 && (
                        <optgroup label="Custom Created Architect Roles">
                          {roles.map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Account Status *</label>
                    <select
                      value={userStatus}
                      onChange={(e) => setUserStatus(e.target.value as "active" | "inactive")}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-slate-800 focus:bg-white rounded-xl font-medium outline-none transition-all text-sm"
                    >
                      <option value="active">Active System Member</option>
                      <option value="inactive">Suspended / Devalidated account</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Designation / Post</label>
                    <input
                      type="text"
                      value={userDesignation}
                      onChange={(e) => setUserDesignation(e.target.value)}
                      placeholder="e.g. Senior Inventory Supervisor"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-slate-800 focus:bg-white rounded-xl font-medium outline-none transition-all text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Department</label>
                    <input
                      type="text"
                      value={userDepartment}
                      onChange={(e) => setUserDepartment(e.target.value)}
                      placeholder="e.g. Finance & POS"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-slate-800 focus:bg-white rounded-xl font-medium outline-none transition-all text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Mobile Phone</label>
                    <input
                      type="text"
                      value={userMobile}
                      onChange={(e) => setUserMobile(e.target.value)}
                      placeholder="e.g. +880 171XXXXXXX"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-slate-800 focus:bg-white rounded-xl font-medium outline-none transition-all text-sm"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Profile Photo Upload</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-center bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                      <div className="flex justify-center items-center">
                        <div className="w-24 h-24 rounded-2xl overflow-hidden bg-white border border-slate-200 relative group flex items-center justify-center shadow-sm">
                          {userPhotoURL ? (
                            <>
                              <img src={userPhotoURL} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              <button
                                type="button"
                                onClick={() => setUserPhotoURL("")}
                                className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[9px] font-extrabold uppercase tracking-widest cursor-pointer"
                              >
                                Clear Photo
                              </button>
                            </>
                          ) : (
                            <div className="text-center p-2 text-slate-400">
                              <Camera className="w-8 h-8 mx-auto mb-1 text-slate-400" />
                              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none">No Photo</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="sm:col-span-2">
                        <div 
                          onClick={() => document.getElementById("photo-upload-input")?.click()}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const file = e.dataTransfer.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = () => setUserPhotoURL(reader.result as string);
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="border-2 border-dashed border-slate-200 hover:border-slate-950 rounded-2xl p-5 text-center cursor-pointer hover:bg-white hover:shadow-sm transition-all flex flex-col items-center justify-center min-h-[96px] group"
                        >
                          <Plus className="w-5 h-5 text-slate-400 mb-1 group-hover:text-slate-800 transition-colors" />
                          <p className="text-xs font-semibold text-slate-700">
                            Drag & drop or <span className="text-indigo-600 hover:underline">click to upload photo</span>
                          </p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Supports PNG, JPG, JPEG, SVG</p>
                          <input 
                            type="file" 
                            id="photo-upload-input" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = () => setUserPhotoURL(reader.result as string);
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Description Bio</label>
                  <textarea
                    rows={2}
                    value={userBio}
                    onChange={(e) => setUserBio(e.target.value)}
                    placeholder="Short bio description..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-slate-800 focus:bg-white rounded-xl font-medium outline-none transition-all text-sm focus:ring-0"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setUserFormOpen(false);
                      clearUserForm();
                    }}
                    className="px-5 py-3 bg-slate-100 text-slate-705 ml-3 font-semibold text-xs uppercase tracking-wider rounded-xl hover:bg-slate-200 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-3 bg-slate-950 text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-slate-850 active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <UserCheck className="w-4 h-4" /> Save User Access Settings
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* ==================== 2. ROLE CREATION / ARCHITECT FORM ==================== */}
          {roleFormOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white border border-indigo-200 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-indigo-900" />
              <div className="flex items-center justify-between mb-6 border-b border-indigo-50 pb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-50 rounded-xl text-indigo-805">
                    <Shield className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="font-extrabold text-indigo-950 text-lg">
                      {editingRole ? "Modify Custom Access Role" : "Architect Custom Role & Menus Perms"}
                    </h2>
                    <p className="text-xs text-indigo-400 font-semibold">
                      Control precisely which modules, dashboards and action menus are visible to users under this role.
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setRoleFormOpen(false);
                    clearRoleForm();
                  }}
                  className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateOrUpdateRole} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Role ID Name *</label>
                    <input
                      type="text"
                      required
                      value={roleName}
                      onChange={(e) => setRoleName(e.target.value)}
                      placeholder="e.g. Sales Executive Manager"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-indigo-800 focus:bg-white rounded-xl font-medium outline-none transition-all text-sm"
                      disabled={!!editingRole}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Brief Role Description</label>
                    <input
                      type="text"
                      value={roleDescription}
                      onChange={(e) => setRoleDescription(e.target.value)}
                      placeholder="e.g. Sub-admin permissions with ledger limits"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-indigo-800 focus:bg-white rounded-xl font-medium outline-none transition-all text-sm"
                    />
                  </div>
                </div>

                {/* Grid of Menus */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-1.5 leading-none">
                      <LayoutGrid className="w-4 h-4 text-indigo-600" /> Choose Allowed Component View permissions
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setRoleAllowedMenus(ALL_MENU_IDS)}
                        className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                      >
                        Grant Full Workspace
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setRoleAllowedMenus([])}
                        className="text-[10px] font-bold text-rose-500 hover:underline cursor-pointer"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {SYSTEM_MENUS.map((cat) => {
                      const catMenuIds = cat.items.map(item => item.id);
                      const isAllChecked = catMenuIds.every(id => roleAllowedMenus.includes(id));
                      const isSomeChecked = catMenuIds.some(id => roleAllowedMenus.includes(id)) && !isAllChecked;

                      return (
                        <div key={cat.category} className="bg-slate-50 border border-slate-150/80 rounded-2xl p-4 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200/60">
                              <span className="text-xs font-black uppercase text-indigo-905 tracking-wider">{cat.category}</span>
                              <input
                                type="checkbox"
                                checked={isAllChecked}
                                ref={(el) => {
                                  if (el) el.indeterminate = isSomeChecked;
                                }}
                                onChange={(e) => toggleAllCategoryMenus(catMenuIds, e.target.checked)}
                                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-505 shrink-0 cursor-pointer"
                              />
                            </div>
                            <div className="space-y-2.5">
                              {cat.items.map(item => {
                                const isPermitted = roleAllowedMenus.includes(item.id);
                                return (
                                  <div 
                                    key={item.id} 
                                    onClick={() => toggleMenuPermissions(item.id)}
                                    className={cn(
                                      "flex items-start gap-2.5 p-2 rounded-xl transition-all cursor-pointer select-none",
                                      isPermitted ? "bg-white border border-indigo-100" : "hover:bg-slate-100 border border-transparent"
                                    )}
                                  >
                                    <div className="pt-0.5">
                                      {isPermitted ? (
                                        <CheckSquare className="w-4 h-4 text-indigo-650" />
                                      ) : (
                                        <Square className="w-4 h-4 text-slate-350" />
                                      )}
                                    </div>
                                    <div>
                                      <p className="text-xs font-extrabold text-slate-800 leading-tight">{item.name}</p>
                                      <p className="text-[10px] text-slate-400 font-medium leading-none mt-0.5">{item.description}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setRoleFormOpen(false);
                      clearRoleForm();
                    }}
                    className="px-5 py-3 bg-slate-100 text-slate-700 font-semibold text-xs uppercase tracking-wider rounded-xl hover:bg-slate-200 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-3 bg-indigo-950 text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-indigo-900 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer animate-pulse-once"
                  >
                    <Check className="w-4 h-4 text-indigo-400" /> Save Role Mapping Configuration
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* ==================== 3. DETAILED BEAUTIFUL PROFILE VIEW ==================== */}
          {selectedProfile && (
            <motion.div
              layout
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-slate-200/90 rounded-3xl p-6 md:p-10 shadow-xl relative overflow-hidden"
            >
              {/* Profile Background Banner Decor */}
              <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-950 border-b border-white/10" />
              
              <div className="relative pt-12 md:pt-16 flex flex-col md:flex-row gap-8 items-start">
                {/* Visual Avatar */}
                <div className="relative shrink-0 mx-auto md:mx-0">
                  <div className="w-32 h-32 md:w-40 md:h-40 rounded-3xl border-4 border-white shadow-2xl overflow-hidden bg-slate-100 relative group">
                    <img 
                      src={selectedProfile.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(selectedProfile.displayName)}`} 
                      alt={selectedProfile.displayName} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  {/* Active / Inactive badge */}
                  <span className={cn(
                    "absolute -bottom-2 right-4 px-3 py-1 font-black text-[9px] uppercase tracking-widest rounded-full shadow-lg border-2 border-white",
                    selectedProfile.status === "active" ? "bg-teal-500 text-white" : "bg-rose-500 text-white"
                  )}>
                    {selectedProfile.status || "ACTIVE"}
                  </span>
                </div>

                {/* Profile credentials */}
                <div className="flex-1 space-y-4 text-center md:text-left">
                  <div>
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5 mb-1">
                      <h2 className="text-3xl font-black text-slate-900 tracking-tight">{selectedProfile.displayName}</h2>
                      <span className="px-3 py-1 bg-indigo-50 text-indigo-700 font-black text-[10px] uppercase tracking-widest rounded-full flex items-center gap-1">
                        <Award className="w-3 h-3 text-indigo-500" />
                        {getRoleDisplayName(selectedProfile.role)}
                      </span>
                    </div>
                    {selectedProfile.designation && (
                      <p className="text-base font-bold text-slate-550 flex items-center justify-center md:justify-start gap-1">
                        <Briefcase className="w-4 h-4 text-slate-450" />
                        {selectedProfile.designation} {selectedProfile.department && `• ${selectedProfile.department}`}
                      </p>
                    )}
                  </div>

                  {selectedProfile.bio && (
                    <p className="text-sm text-slate-500 italic max-w-xl bg-slate-50 px-4 py-3 rounded-2xl border border-slate-100 inline-block text-left">
                      "{selectedProfile.bio}"
                    </p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-left max-w-xl">
                    <div className="flex items-center gap-2.5 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                      <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                      <div>
                        <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Primary Email / User ID</p>
                        <p className="text-xs font-bold font-mono text-slate-805">{cleanEmailDisplay(selectedProfile.email)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                      <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                      <div>
                        <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Contact Number</p>
                        <p className="text-xs font-bold text-slate-800">{selectedProfile.mobile || "Not specified"}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Back or actions */}
                <div className="w-full md:w-auto flex md:flex-col gap-2 shrink-0">
                  {role === "admin" && (selectedProfile.email?.toLowerCase() !== "modern@admin.com" || user?.email?.toLowerCase() === "modern@admin.com") && (
                    <button
                      onClick={() => {
                        setEditingUser(selectedProfile);
                        setUserDisplayName(selectedProfile.displayName);
                        const displayEmail = selectedProfile.username || cleanEmailDisplay(selectedProfile.email);
                        setUserEmail(displayEmail);
                        setUserPassword(selectedProfile.password || "");
                        setUserRole(selectedProfile.role);
                        setUserPhotoURL(selectedProfile.photoURL || "");
                        setUserMobile(selectedProfile.mobile || "");
                        setUserDesignation(selectedProfile.designation || "");
                        setUserDepartment(selectedProfile.department || "");
                        setUserBio(selectedProfile.bio || "");
                        setUserStatus(selectedProfile.status || "active");
                        setUserFormOpen(true);
                      }}
                      className="flex-1 md:flex-none px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit Profile
                    </button>
                  )}
                  {activeSubView !== "profileView" && (
                    <button
                      onClick={() => setSelectedProfile(null)}
                      className="flex-1 md:flex-none px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Back to List
                    </button>
                  )}
                </div>
              </div>

              {/* Authorized Menus Grid */}
              <div className="mt-10 pt-8 border-t border-slate-100">
                <div className="flex items-center gap-2 mb-4">
                  <BadgeCheck className="w-5 h-5 text-teal-500" />
                  <h3 className="text-sm font-black uppercase text-slate-800 tracking-wider">
                    Assigned Workspace Permissions Dashboard
                  </h3>
                </div>
                
                <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                  <p className="text-xs text-slate-500 font-medium mb-4">
                    Based on user role <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">{selectedProfile.role}</span>, this account has safe authorization clearance to access:
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {(() => {
                      // Resolve which menus are allowed
                      let allowed: string[] = [];
                      if (selectedProfile.role === "admin") {
                        allowed = ALL_MENU_IDS;
                      } else {
                        const customRole = roles.find(r => r.id === selectedProfile.role);
                        if (customRole) {
                          allowed = customRole.allowedMenus;
                        } else {
                          // Standard defaults fallback
                          if (selectedProfile.role === "accountant") {
                            allowed = ALL_MENU_IDS.filter(id => id !== "newUser" && id !== "usersList" && id !== "rolesList" && id !== "settings");
                          } else {
                            allowed = ["dashboard", "newSale", "salesList", "transactions"];
                          }
                        }
                      }

                      return ALL_MENU_IDS.map(menuId => {
                        const hasMenu = allowed.includes(menuId);
                        const menuLabel = SYSTEM_MENUS.flatMap(cat => cat.items).find(item => item.id === menuId)?.name || menuId;
                        return (
                          <div 
                            key={menuId} 
                            className={cn(
                              "px-3 py-2.5 rounded-xl border flex items-center gap-2 text-xs font-semibold",
                              hasMenu 
                                ? "bg-white border-teal-150 text-teal-850 shadow-sm shadow-teal-50/20" 
                                : "bg-slate-100/50 border-slate-150 text-slate-350 line-through select-none"
                            )}
                          >
                            <Check className={cn("w-3.5 h-3.5 shrink-0", hasMenu ? "text-teal-600" : "text-slate-300")} />
                            <span className="truncate">{menuLabel}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ==================== 4. SUBVIEW: DIRECTORY LIST OF USERS ==================== */}
          {activeSubView === "usersList" && !selectedProfile && (
            <motion.div layout className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden p-6 md:p-8 space-y-4">
              <div className="flex flex-col md:flex-row gap-4 justify-between">
                {/* Search query input */}
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search name, email, designation..."
                    className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 focus:border-slate-800 focus:bg-white rounded-xl font-medium outline-none transition-all text-xs"
                  />
                </div>
              </div>

              {filteredUsers.length === 0 ? (
                <div className="text-center py-12 text-slate-400 font-medium text-sm">
                  No registered profiles found matching your search.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-slate-100">
                        <th className="p-4 pl-6">Profile Member</th>
                        <th className="p-4">Staff Contact</th>
                        <th className="p-4">Granted Access Level</th>
                        <th className="p-4">Status Pin</th>
                        <th className="p-4 text-center pr-6">Action Pane</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700 text-xs">
                      {filteredUsers.map((profileItem) => {
                        const isSelf = profileItem.uid === user.uid || profileItem.email.toLowerCase() === user.email?.toLowerCase();
                        
                        return (
                          <tr key={profileItem.id} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="p-4 pl-6">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-50 border border-slate-150 relative shrink-0">
                                  <img 
                                    src={profileItem.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(profileItem.displayName)}`} 
                                    alt={profileItem.displayName} 
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                                <div>
                                  <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                                    {profileItem.displayName}
                                    {isSelf && (
                                      <span className="text-[9px] bg-slate-900 text-white font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider">
                                        You
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest leading-none mt-0.5">
                                    {profileItem.designation || "Shop Member"}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="p-4">
                              <p className="font-semibold text-slate-805 leading-tight">{cleanEmailDisplay(profileItem.email)}</p>
                              {profileItem.mobile && <p className="text-[10px] text-slate-400 leading-none mt-0.5">{profileItem.mobile}</p>}
                            </td>
                            <td className="p-4">
                              <span className={cn(
                                "px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-full border shadow-sm",
                                profileItem.role === "admin" ? "bg-slate-950 text-white border-transparent" :
                                profileItem.role === "accountant" ? "bg-blue-50 text-blue-800 border-blue-100" :
                                profileItem.role === "sales" ? "bg-teal-50 text-teal-800 border-teal-100" :
                                "bg-indigo-50 text-indigo-800 border-indigo-100"
                              )}>
                                {getRoleDisplayName(profileItem.role)}
                              </span>
                            </td>
                            <td className="p-4 col-status">
                              <span className={cn(
                                "flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider",
                                (profileItem.status || "active") === "active" ? "text-teal-605" : "text-rose-505"
                              )}>
                                <span className={cn(
                                  "w-1.5 h-1.5 rounded-full inline-block",
                                  (profileItem.status || "active") === "active" ? "bg-teal-500 animate-pulse" : "bg-rose-500"
                                )} />
                                {profileItem.status || "active"}
                              </span>
                            </td>
                            <td className="p-4 text-center pr-6">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => setSelectedProfile(profileItem)}
                                  className="p-2 bg-slate-50 hover:bg-slate-100 hover:text-slate-900 border border-slate-150 rounded-xl text-slate-500 transition-colors pointer-cursor"
                                  title="View Credentials Profile"
                                >
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                                
                                {role === "admin" && !isSelf && profileItem.email?.toLowerCase() !== "modern@admin.com" && (
                                  deleteConfirmUserId === profileItem.id ? (
                                    <div className="flex items-center gap-1 shrink-0 animate-in fade-in duration-100">
                                      <button 
                                        onClick={() => handleDeleteUser(profileItem.id || "")}
                                        className="px-2 py-1 text-[9px] font-black uppercase tracking-wider bg-rose-600 hover:bg-rose-700 text-white rounded-md cursor-pointer transition-all"
                                      >
                                        Confirm
                                      </button>
                                      <button 
                                        onClick={() => setDeleteConfirmUserId(null)}
                                        className="px-2 py-1 text-[9px] font-black uppercase tracking-wider bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md cursor-pointer transition-all"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setDeleteConfirmUserId(profileItem.id || "")}
                                      className="p-2 hover:bg-red-50 hover:text-red-700 text-slate-350 border border-transparent hover:border-red-100 rounded-xl transition-colors pointer-cursor"
                                      title="Revoke and Delete Access"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}

          {/* ==================== 5. SUBVIEW: ROLES LIST ARCHITECTS ==================== */}
          {activeSubView === "rolesList" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left summary / standard roles list */}
              <div className="lg:col-span-1 space-y-4">
                <div className="bg-white border border-slate-105 rounded-2xl p-5 shadow-sm">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-3 leading-none">
                    <ShieldAlert className="w-4 h-4 text-slate-400" /> Built-in System Roles
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed mb-4">
                    These standard preset role levels serve as security foundations and cannot be deleted.
                  </p>

                  <div className="space-y-3">
                    <div className="p-3.5 bg-slate-50 border border-slate-150 rounded-xl">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-black uppercase text-slate-900 tracking-wider">Administrator</span>
                        <span className="text-[9px] bg-slate-900 text-white font-extrabold px-1.5 py-0.5 rounded">CORE</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-semibold leading-tight">
                        Ultimate clearance level. Absolute command of configurations, sales, ledgers, staff database, and security maps.
                      </p>
                    </div>

                    <div className="p-3.5 bg-slate-50 border border-slate-150 rounded-xl">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-black uppercase text-blue-900 tracking-wider">Accountant Ledger Agent</span>
                        <span className="text-[9px] bg-blue-105 text-blue-800 font-bold px-1.5 py-0.5 rounded uppercase">Preset</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-semibold leading-tight">
                        Disbursals, purchases register, and financial ledger commands. Safe isolation from deleting cores.
                      </p>
                    </div>

                    <div className="p-3.5 bg-slate-50 border border-slate-150 rounded-xl">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-black uppercase text-teal-900 tracking-wider">Sales Hub Staff</span>
                        <span className="text-[9px] bg-teal-100 text-teal-800 font-bold px-1.5 py-0.5 rounded uppercase">Preset</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-semibold leading-tight">
                        Standard POS checkout, customer sales journal, and basic personal transactions record. Restricted.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Custom Role permissions mapping */}
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white border border-slate-100 rounded-3xl shadow-sm p-6 md:p-8 space-y-4">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Award className="w-5 h-5 text-indigo-500" /> Custom Architecture Role Permissions
                  </h3>

                  {roles.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 font-medium text-xs border border-dashed border-slate-200 rounded-2xl">
                      No custom roles created yet. Define custom roles to filter system menus separately.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {roles.map((r) => (
                        <div 
                          key={r.id} 
                          className="p-4 border border-slate-150 rounded-2xl hover:border-indigo-150 hover:shadow-sm transition-all bg-white"
                        >
                          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-3 pb-3 border-b border-slate-100">
                            <div>
                              <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                                {r.name}
                                <span className="text-[9px] bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded-full border border-indigo-100">
                                  {r.allowedMenus.length} Allowed Menus
                                </span>
                              </h4>
                              {r.description && <p className="text-[11px] text-slate-400 font-semibold mt-0.5">{r.description}</p>}
                            </div>

                            {role === "admin" && (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    setEditingRole(r);
                                    setRoleName(r.name);
                                    setRoleDescription(r.description || "");
                                    setRoleAllowedMenus(r.allowedMenus);
                                    setRoleFormOpen(true);
                                  }}
                                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-[10px] uppercase rounded-lg border border-slate-200 transition-colors cursor-pointer"
                                >
                                  Modify
                                </button>
                                {deleteConfirmRoleId === r.id ? (
                                  <div className="flex items-center gap-1.5 animate-in fade-in duration-100">
                                    <button
                                      onClick={() => handleDeleteRole(r.id || "")}
                                      className="px-2 py-1 text-[9px] font-black uppercase tracking-wider bg-rose-600 hover:bg-rose-700 text-white rounded-md cursor-pointer transition-all"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirmRoleId(null)}
                                      className="px-2 py-1 text-[9px] font-black uppercase tracking-wider bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md cursor-pointer transition-all"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDeleteConfirmRoleId(r.id || "")}
                                    className="p-1.5 hover:bg-red-55 hover:text-red-700 text-slate-350 border border-transparent hover:border-red-100 rounded-lg transition-colors cursor-pointer"
                                    title="Delete Role"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {r.allowedMenus.map(menuId => {
                              const menuLabel = ALL_MENU_IDS.includes(menuId) 
                                ? (SYSTEM_MENUS.flatMap(cat => cat.items).find(item => item.id === menuId)?.name || menuId)
                                : menuId;
                              return (
                                <span 
                                  key={menuId} 
                                  className="px-2 py-0.5 bg-slate-50 text-slate-600 font-bold text-[9px] rounded-md border border-slate-100 uppercase tracking-tight"
                                >
                                  {menuLabel}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
