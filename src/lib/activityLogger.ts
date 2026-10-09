import { collection, addDoc, updateDoc, doc, deleteDoc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { ActivityAction, ActivityNotification } from "../types";
import { saveActivityNotificationToSupabase } from "./supabaseDb";
import { isSupabaseConfigured } from "./supabase";

// In-memory debounce cache to prevent duplicate activity logging within a window
const recentActionCache: Record<string, number> = {};

/**
 * Checks if a user is the Super Admin.
 * Super Admin activity requires NO notification creation.
 */
export function isSuperAdminUser(userRole?: string, userEmail?: string): boolean {
  if (!userRole && !userEmail) return false;
  const role = (userRole || "").toLowerCase().trim();
  const email = (userEmail || "").toLowerCase().trim();
  return (
    role === "admin" ||
    role === "superadmin" ||
    role === "super_admin" ||
    email === "joydutta398878@gmail.com"
  );
}

export interface LogActivityParams {
  userId?: string;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  userPhoto?: string;
  menuId: string;
  menuLabel: string;
  action: ActivityAction;
  title: string;
  note: string;
  metadata?: Record<string, any>;
}

/**
 * Logs user activity directly for Super Admin review.
 * RULES:
 * 1. When Super Admin is using the system, NO notifications are generated.
 * 2. When other users (non-admin) use the system, a single consolidated notification
 *    is recorded which can be checked later by the Super Admin in the notification center.
 */
export async function logUserActivity(params: LogActivityParams): Promise<string | null> {
  try {
    const {
      userId = "system",
      userName = "User",
      userEmail = "anonymous@system.local",
      userRole = "user",
      userPhoto,
      menuId,
      menuLabel,
      action,
      title,
      note,
      metadata = {}
    } = params;

    // RULE 1: Super Admin actions do NOT need any notifications
    if (isSuperAdminUser(userRole, userEmail)) {
      return null;
    }

    // RULE 2: Passive page views or menu switches do not generate notifications
    if (action === "view") {
      return null;
    }

    // RULE 3: Debounce & deduplicate actions from the same non-admin user within 15 seconds
    // to ensure a single clean notification is recorded instead of multiple duplicate alerts
    const debounceKey = `${userId}_${action}_${menuId}`;
    const now = Date.now();
    const lastLogged = recentActionCache[debounceKey] || 0;
    if (now - lastLogged < 15000) {
      return null;
    }
    recentActionCache[debounceKey] = now;

    const newNotification: Omit<ActivityNotification, "id"> = {
      userId,
      userName: userName || userEmail.split("@")[0] || "User",
      userEmail,
      userRole,
      userPhoto: userPhoto || undefined,
      menuId,
      menuLabel,
      action,
      title,
      note,
      metadata,
      timestamp: new Date().toISOString(),
      readBy: [],
      createdAt: new Date().toISOString()
    };

    // If Supabase is configured, write directly to Supabase activity_notifications
    if (isSupabaseConfigured()) {
      saveActivityNotificationToSupabase(newNotification).catch(err => {
        console.warn("Could not save activity notification to Supabase:", err);
      });
    }

    // Clean any undefined fields before sending to Firestore
    const cleanedData: Record<string, any> = {};
    for (const [key, value] of Object.entries(newNotification)) {
      if (value !== undefined) {
        cleanedData[key] = value;
      }
    }

    let docId = "local-" + Date.now();
    try {
      const docRef = await addDoc(collection(db, "activityNotifications"), cleanedData);
      docId = docRef.id;
    } catch (fsErr) {
      // Ignore Firestore quota/network errors so application never crashes
      console.warn("Firestore notification sync restricted:", fsErr);
    }

    // Dispatch custom browser event for instant local reactive updates
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("activity-notification-created", {
          detail: { id: docId, ...cleanedData }
        })
      );
    }

    return docId;
  } catch (error) {
    console.warn("Could not record activity notification:", error);
    return null;
  }
}

/**
 * Web Audio API gentle chime sound for real-time notifications
 */
export function playNotificationChime() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Pleasant dual-tone chime
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08); // A5

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {
    // Audio autoplay might be restricted by browser policy before first interaction
  }
}

/**
 * Mark a single notification as read by the admin user
 */
export async function markNotificationAsRead(notificationId: string, adminUserId: string) {
  try {
    const notifRef = doc(db, "activityNotifications", notificationId);
    await updateDoc(notifRef, {
      readBy: [adminUserId]
    });
  } catch (e) {
    console.warn("Error marking notification as read:", e);
  }
}

/**
 * Mark all visible unread notifications as read by admin
 */
export async function markAllNotificationsAsRead(notifications: ActivityNotification[], adminUserId: string) {
  try {
    const unreadList = notifications.filter(n => !n.readBy || !n.readBy.includes(adminUserId));
    if (unreadList.length === 0) return;

    const batch = writeBatch(db);
    unreadList.forEach(n => {
      if (n.id) {
        const notifRef = doc(db, "activityNotifications", n.id);
        const currentRead = Array.isArray(n.readBy) ? n.readBy : [];
        batch.update(notifRef, {
          readBy: [...new Set([...currentRead, adminUserId])]
        });
      }
    });
    await batch.commit();
  } catch (e) {
    console.warn("Error marking all notifications as read:", e);
  }
}

/**
 * Clear/delete a specific activity notification
 */
export async function deleteActivityNotification(notificationId: string) {
  try {
    await deleteDoc(doc(db, "activityNotifications", notificationId));
  } catch (e) {
    console.warn("Error deleting notification:", e);
  }
}

/**
 * Clear/delete all notifications (Admin only)
 */
export async function clearAllActivityNotifications(notifications: ActivityNotification[]) {
  try {
    const batch = writeBatch(db);
    notifications.forEach(n => {
      if (n.id) {
        batch.delete(doc(db, "activityNotifications", n.id));
      }
    });
    await batch.commit();
  } catch (e) {
    console.warn("Error clearing notifications:", e);
  }
}
