'use strict';
const {SlashCommandBuilder, PermissionFlagsBits}=require('discord.js');
// Only one slash command. All systems are chosen through Discord components.
const setupCommand=new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Novora Control Center – alle Systeme über ein Menü einrichten')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
module.exports={setupCommand};
