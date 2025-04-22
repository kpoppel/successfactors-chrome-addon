rm successfactors-chrome-addon.zip config.zip
zip -r successfactors-chrome-addon.zip successfactors-chrome-addon -x "successfactors-chrome-addon/config/*" -x "successfactors-chrome-addon/README.md"
zip -r config.zip successfactors-chrome-addon/config/ -x "successfactors-chrome-addon/config/*.yaml_tmpl"
