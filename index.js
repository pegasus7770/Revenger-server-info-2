(() => {
  let unpatches = [];

  const getVendetta = () => window.vendetta || {};

  const getStores = () => {
    const v = getVendetta();
    const metro = v.metro || {};
    const common = metro.common || {};
    const findByStoreName = metro.findByStoreName || (() => null);

    const GuildStore = common.GuildStore || findByStoreName("GuildStore");
    const SelectedGuildStore = common.SelectedGuildStore || findByStoreName("SelectedGuildStore");
    const ChannelStore = common.ChannelStore || findByStoreName("ChannelStore");
    const GuildMemberCountStore = findByStoreName("GuildMemberCountStore");
    const UserStore = common.UserStore || findByStoreName("UserStore");

    return {
      GuildStore,
      SelectedGuildStore,
      ChannelStore,
      GuildMemberCountStore,
      UserStore
    };
  };

  const snowflakeToDate = (id) => {
    try {
      if (!id) return "Unknown";
      const timestamp = Number((BigInt(id) >> 22n) + 1420070400000n);
      const d = new Date(timestamp);
      return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
    } catch {
      return "Unknown";
    }
  };

  const verificationLevels = {
    0: "None (0)",
    1: "Low (1)",
    2: "Medium (2)",
    3: "High (3)",
    4: "Very High (4)"
  };

  const getGuildDetails = (guildId) => {
    const {
      GuildStore,
      SelectedGuildStore,
      ChannelStore,
      GuildMemberCountStore,
      UserStore
    } = getStores();

    const targetId = guildId || SelectedGuildStore?.getGuildId?.();
    if (!targetId) return null;

    const guild = GuildStore?.getGuild?.(targetId);
    if (!guild) return null;

    const owner = guild.ownerId ? UserStore?.getUser?.(guild.ownerId) : null;
    const ownerTag = owner
      ? `${owner.username}${owner.discriminator && owner.discriminator !== "0" ? "#" + owner.discriminator : ""} (${guild.ownerId})`
      : `${guild.ownerId || "Unknown"}`;

    let memberCount = "Unknown";
    if (GuildMemberCountStore?.getMemberCount) {
      const count = GuildMemberCountStore.getMemberCount(targetId);
      if (typeof count === "number") memberCount = String(count);
    } else if (typeof guild.memberCount === "number") {
      memberCount = String(guild.memberCount);
    }

    let channelCount = "Unknown";
    try {
      if (ChannelStore?.getMutableGuildChannelsForGuild) {
        const chMap = ChannelStore.getMutableGuildChannelsForGuild(targetId);
        if (chMap) channelCount = String(Object.keys(chMap).length);
      } else if (ChannelStore?.getChannels) {
        const all = ChannelStore.getChannels();
        if (all) {
          channelCount = String(
            Object.values(all).filter((c) => c && c.guild_id === targetId).length
          );
        }
      }
    } catch {}

    let roleCount = "Unknown";
    try {
      if (GuildStore?.getRoles) {
        const roles = GuildStore.getRoles(targetId);
        if (roles) roleCount = String(Object.keys(roles).length);
      } else if (guild.roles) {
        roleCount = String(Object.keys(guild.roles).length);
      }
    } catch {}

    const boostLevel = guild.premiumTier ?? 0;
    const boostCount = guild.premiumSubscriptionCount ?? 0;
    const verification = verificationLevels[guild.verificationLevel] ?? String(guild.verificationLevel ?? "Unknown");
    const createdAt = snowflakeToDate(targetId);

    const iconUrl = guild.icon
      ? `https://cdn.discordapp.com/icons/${targetId}/${guild.icon}.${guild.icon.startsWith("a_") ? "gif" : "png"}?size=1024`
      : null;

    const report = [
      `Server Name: ${guild.name}`,
      `Server ID: ${targetId}`,
      `Owner: ${ownerTag}`,
      `Members: ${memberCount}`,
      `Channels: ${channelCount}`,
      `Roles: ${roleCount}`,
      `Boosts: Level ${boostLevel} (${boostCount} Boosts)`,
      `Verification: ${verification}`,
      `Created At: ${createdAt}`,
      `Icon URL: ${iconUrl || "None"}`
    ].join("\n");

    return {
      id: targetId,
      name: guild.name,
      ownerTag,
      memberCount,
      channelCount,
      roleCount,
      boostLevel,
      boostCount,
      verification,
      createdAt,
      iconUrl,
      report
    };
  };

  const copyText = (text, label) => {
    const v = getVendetta();
    const clipboard = v.metro?.common?.clipboard;
    const showToast = v.ui?.toasts?.showToast;
    const getAssetIDByName = v.ui?.assets?.getAssetIDByName;

    try {
      if (clipboard?.setString) {
        clipboard.setString(String(text));
        if (showToast) {
          showToast(
            `Copied ${label}`,
            getAssetIDByName ? getAssetIDByName("Check") : undefined
          );
        }
      }
    } catch {}
  };

  const tryOpenGuildSettings = (guildId) => {
    const v = getVendetta();
    const metro = v.metro || {};
    const showToast = v.ui?.toasts?.showToast;
    const hideActionSheet = metro.findByProps?.("hideActionSheet")?.hideActionSheet;

    try {
      if (hideActionSheet) hideActionSheet();
    } catch {}

    try {
      const settingsMod =
        metro.findByProps?.("openGuildSettings") ||
        metro.findByProps?.("transitionToGuildSettings");

      if (settingsMod?.openGuildSettings) {
        settingsMod.openGuildSettings(guildId);
        return true;
      }
      if (settingsMod?.transitionToGuildSettings) {
        settingsMod.transitionToGuildSettings(guildId);
        return true;
      }
    } catch {}

    if (showToast) {
      showToast("Native guild settings route unavailable on this client build");
    }
    return false;
  };

  const showInspectorModal = (guildId) => {
    const v = getVendetta();
    const alerts = v.ui?.alerts;
    const showToast = v.ui?.toasts?.showToast;
    const info = getGuildDetails(guildId);

    if (!info) {
      if (showToast) showToast("Open a server first to inspect it");
      return;
    }

    if (alerts?.showAlert) {
      alerts.showAlert({
        title: `${info.name}`,
        content: info.report,
        confirmText: "Copy Full Report",
        cancelText: "Close",
        onConfirm: () => copyText(info.report, "Full Report"),
        secondaryConfirmText: "Open Native Settings",
        onConfirmSecondary: () => tryOpenGuildSettings(info.id)
      });
    } else {
      copyText(info.report, "Full Report");
    }
  };

  const findInTree = (tree, filter, maxDepth = 25) => {
    if (!tree || maxDepth <= 0) return null;
    if (Array.isArray(tree)) {
      for (const item of tree) {
        const res = findInTree(item, filter, maxDepth - 1);
        if (res) return res;
      }
      return null;
    }
    if (typeof tree === "object") {
      if (filter(tree)) return tree;
      if (tree.props?.children) {
        const res = findInTree(tree.props.children, filter, maxDepth - 1);
        if (res) return res;
      }
    }
    return null;
  };

  const patchGuildActionSheet = () => {
    const v = getVendetta();
    const metro = v.metro || {};
    const patcher = v.patcher;
    const React = metro.common?.React;
    const Forms = v.ui?.components?.Forms;
    const getAssetIDByName = v.ui?.assets?.getAssetIDByName;

    if (!patcher || !React || !Forms?.FormRow) return;

    const candidates = [
      metro.findByName?.("GuildActionSheet", false),
      metro.findByName?.("GuildSettingsActionSheet", false),
      metro.findByName?.("GuildHeaderActionSheet", false)
    ].filter(Boolean);

    const lazyModule = metro.findByProps?.("openLazy", "hideActionSheet");
    if (lazyModule?.openLazy) {
      const unpatchLazy = patcher.before("openLazy", lazyModule, ([component, key]) => {
        if (!key || !String(key).toLowerCase().includes("guild")) return;
        Promise.resolve(component).then((mod) => {
          const target = mod?.default || mod;
          if (typeof target === "function" && !target.__si_patched) {
            target.__si_patched = true;
            const unp = patcher.after("default", mod, ([props], res) => {
              const guildId = props?.guild?.id || props?.guildId;
              if (!guildId || !res) return res;

              const container = findInTree(
                res,
                (node) => Array.isArray(node?.props?.children) && node.props.children.length > 0
              );

              if (container && Array.isArray(container.props.children)) {
                const already = container.props.children.some(
                  (c) => c?.key === "server-inspector-row"
                );
                if (!already) {
                  const iconId = getAssetIDByName ? getAssetIDByName("ic_info_24px") : undefined;
                  const row = React.createElement(Forms.FormRow, {
                    key: "server-inspector-row",
                    label: "Server Settings & Inspector",
                    subLabel: "Inspect metadata, boosts, IDs & native settings",
                    leading: iconId ? React.createElement(Forms.FormRow.Icon, { source: iconId }) : undefined,
                    onPress: () => {
                      try {
                        lazyModule.hideActionSheet?.();
                      } catch {}
                      showInspectorModal(guildId);
                    }
                  });
                  container.props.children.unshift(row);
                }
              }
              return res;
            });
            unpatches.push(unp);
          }
        }).catch(() => {});
      });
      unpatches.push(unpatchLazy);
    }

    for (const mod of candidates) {
      if (mod?.default && !mod.__si_direct) {
        mod.__si_direct = true;
        const unp = patcher.after("default", mod, ([props], res) => {
          const guildId = props?.guild?.id || props?.guildId;
          if (!guildId || !res) return res;
          const container = findInTree(
            res,
            (node) => Array.isArray(node?.props?.children) && node.props.children.length > 0
          );
          if (container && Array.isArray(container.props.children)) {
            const already = container.props.children.some(
              (c) => c?.key === "server-inspector-row"
            );
            if (!already) {
              const iconId = getAssetIDByName ? getAssetIDByName("ic_info_24px") : undefined;
              const row = React.createElement(Forms.FormRow, {
                key: "server-inspector-row",
                label: "Server Settings & Inspector",
                subLabel: "Inspect metadata, boosts, IDs & native settings",
                leading: iconId ? React.createElement(Forms.FormRow.Icon, { source: iconId }) : undefined,
                onPress: () => showInspectorModal(guildId)
              });
              container.props.children.unshift(row);
            }
          }
          return res;
        });
        unpatches.push(unp);
      }
    }
  };

  const SettingsComponent = () => {
    const v = getVendetta();
    const React = v.metro?.common?.React;
    const RN = v.metro?.common?.ReactNative;
    const Forms = v.ui?.components?.Forms;
    const getAssetIDByName = v.ui?.assets?.getAssetIDByName;

    if (!React || !RN || !Forms) return null;

    const { ScrollView } = RN;
    const { FormSection, FormRow, FormDivider } = Forms;
    const [, forceUpdate] = React.useState(0);

    const info = getGuildDetails();
    const iconInfo = getAssetIDByName ? getAssetIDByName("ic_info_24px") : undefined;
    const iconCopy = getAssetIDByName ? getAssetIDByName("ic_copy_24px") || getAssetIDByName("copy") : undefined;
    const iconSettings = getAssetIDByName ? getAssetIDByName("ic_settings_24px") || getAssetIDByName("settings") : undefined;

    return React.createElement(
      ScrollView,
      { style: { flex: 1 } },
      React.createElement(
        FormSection,
        { title: "Active Server Overview" },
        info
          ? [
              React.createElement(FormRow, {
                key: "name",
                label: "Server Name",
                subLabel: info.name,
                leading: iconInfo ? React.createElement(FormRow.Icon, { source: iconInfo }) : undefined
              }),
              React.createElement(FormDivider, { key: "d1" }),
              React.createElement(FormRow, {
                key: "id",
                label: "Server ID",
                subLabel: info.id,
                onPress: () => copyText(info.id, "Server ID")
              }),
              React.createElement(FormDivider, { key: "d2" }),
              React.createElement(FormRow, {
                key: "owner",
                label: "Owner",
                subLabel: info.ownerTag,
                onPress: () => copyText(info.ownerTag, "Owner Info")
              }),
              React.createElement(FormDivider, { key: "d3" }),
              React.createElement(FormRow, {
                key: "counts",
                label: "Members / Channels / Roles",
                subLabel: `${info.memberCount} Members • ${info.channelCount} Channels • ${info.roleCount} Roles`
              }),
              React.createElement(FormDivider, { key: "d4" }),
              React.createElement(FormRow, {
                key: "boosts",
                label: "Boosts & Verification",
                subLabel: `Level ${info.boostLevel} (${info.boostCount} Boosts) • Verification: ${info.verification}`
              }),
              React.createElement(FormDivider, { key: "d5" }),
              React.createElement(FormRow, {
                key: "created",
                label: "Created At (Snowflake)",
                subLabel: info.createdAt
              })
            ]
          : React.createElement(FormRow, {
              key: "none",
              label: "No Server Currently Selected",
              subLabel: "Enter any server channel first, then open this panel or tap the server header."
            })
      ),
      React.createElement(
        FormSection,
        { title: "Actions" },
        React.createElement(FormRow, {
          key: "refresh",
          label: "Refresh Server Data",
          subLabel: "Reload live stores for the currently selected server",
          onPress: () => forceUpdate((n) => n + 1)
        }),
        info &&
          React.createElement(FormRow, {
            key: "open-native",
            label: "Open Native Server Settings",
            subLabel: "Attempt to open Discord native guild settings screen",
            leading: iconSettings ? React.createElement(FormRow.Icon, { source: iconSettings }) : undefined,
            onPress: () => tryOpenGuildSettings(info.id)
          }),
        info &&
          React.createElement(FormRow, {
            key: "copy-id",
            label: "Copy Server ID",
            subLabel: info.id,
            leading: iconCopy ? React.createElement(FormRow.Icon, { source: iconCopy }) : undefined,
            onPress: () => copyText(info.id, "Server ID")
          }),
        info &&
          React.createElement(FormRow, {
            key: "copy-icon",
            label: "Copy Server Icon URL",
            subLabel: info.iconUrl || "Server has no custom icon",
            leading: iconCopy ? React.createElement(FormRow.Icon, { source: iconCopy }) : undefined,
            onPress: () => info.iconUrl && copyText(info.iconUrl, "Icon URL")
          }),
        info &&
          React.createElement(FormRow, {
            key: "copy-report",
            label: "Copy Full Inspector Report",
            subLabel: "Copy all server details formatted as text",
            leading: iconCopy ? React.createElement(FormRow.Icon, { source: iconCopy }) : undefined,
            onPress: () => copyText(info.report, "Full Report")
          })
      )
    );
  };

  return {
    onLoad() {
      try {
        patchGuildActionSheet();
      } catch (e) {
        console.error("[ServerInspector] onLoad error:", e);
      }
    },
    onUnload() {
      for (const unpatch of unpatches) {
        try {
          if (typeof unpatch === "function") unpatch();
        } catch {}
      }
      unpatches = [];
    },
    settings: SettingsComponent
  };
})()
