"use strict";
const Generator = require("yeoman-generator");
// patches the Generator for the install tasks as new custom install
// tasks produce ugly errors! (Related issue: https://github.com/yeoman/environment/issues/309)
require('lodash').extend(Generator.prototype, require('yeoman-generator/lib/actions/install'))

const chalk = require("chalk");
const yosay = require("yosay");
const path = require("path");
const glob = require("glob");
const semver = require("semver");
const packageJson = require('package-json');

module.exports = class extends Generator {
    static displayName = "Create a new OpenUI5/SAPUI5 library";

    prompting() {

        const minFwkVersion = {
            OpenUI5: "1.90.1", //"1.60.0",
            SAPUI5: "1.90.0" //"1.77.0"
        };

        const getTypePackageFor = function(framework, version = "99.99.99") {
            const typesName = semver.gte(version, "1.113.0") ? "types" : "ts-types-esm";
            return `@${framework.toLowerCase()}/${typesName}`;
        };

        const isMetadataOptionsAvailable = function(version) {
            return semver.gte(version, "1.110.0");
        };

        // Have Yeoman greet the user.
        if (!this.options.embedded) {
            this.log(
                yosay(`Welcome to the ${chalk.red("generator-ui5-ts-library")} generator!`)
            );
        }

        const prompts = [
            {
                type: "input",
                name: "libraryname",
                message: "How do you want to name this library?",
                validate: s => {
                    if (/^\d*[a-zA-Z][a-zA-Z0-9]*$/g.test(s)) {
                        return true;
                    }

                    return "Please use alpha numeric characters only for the library name.";
                },
                default: "myUI5Library"
            },
            {
                type: "input",
                name: "namespace",
                message: "Which namespace do you want to use?",
                validate: s => {
                    if (/^[a-zA-Z0-9_.]*$/g.test(s)) {
                        return true;
                    }

                    return "Please use alpha numeric characters and dots only for the namespace.";
                },
                default: "com.myorg"
            },
            {
                type: "list",
                name: "framework",
                message: "Which framework do you want to use?",
                choices: ["OpenUI5", "SAPUI5"],
                default: "OpenUI5"
            },
            {
                when: response => {
                    this._minFwkVersion = minFwkVersion[response.framework];
                    return true;
                },
                type: "input", // HINT: we could also use the version info from OpenUI5/SAPUI5 to provide a selection!
                name: "frameworkVersion",
                message: "Which framework version do you want to use?",
                default: async (answers) => {
                    const npmPackage = getTypePackageFor(answers.framework);
                    try {
                        return (await packageJson(npmPackage)).version;
                    } catch (ex) {
                        chalk.red('Failed to lookup latest version for ${npmPackage}! Fallback to min version...')
                        return minFwkVersion[answers.framework];
                    }
                },
                validate: v => {
                    return (
                        (v && semver.valid(v) && semver.gte(v, this._minFwkVersion)) ||
                        chalk.red(
                            `Framework requires the min version ${this._minFwkVersion}!`
                        )
                    );
                }
            },
            {
                type: "input",
                name: "author",
                message: "Who is the author of the library?",
                default: this.user.git.name()
            },
            {
                type: "confirm",
                name: "newdir",
                message: "Would you like to create a new directory for the library?",
                default: true
            }
        ];

        return this.prompt(prompts).then(props => {
            // To access props later use this.props.someAnswer;
            // this.props = props;
            if (props.newdir) {
                this.destinationRoot(`${props.namespace}.${props.libraryname}`);
            }

            this.config.set(props);
            this.config.set("framework", props.framework);

            // determine the ts-types and version
            this.config.set("tstypes", getTypePackageFor(props.framework, props.frameworkVersion));
            this.config.set("tstypesVersion", props.frameworkVersion);

            // determine how the metadata object can be typed
            const metadataOptionsAvailable = isMetadataOptionsAvailable(props.frameworkVersion);
            this.config.set("metadataOptionsImportLine", metadataOptionsAvailable ? 'import type { MetadataOptions } from "sap/ui/core/Element";\n' : "");
            this.config.set("metadataOptionsType", metadataOptionsAvailable ? "MetadataOptions" : "object");

            this.config.set("namespaceURI", props.namespace.split(".").join("/"));
            this.config.set(
                "librarynamespace",
                `${props.namespace}.${props.libraryname}`
            );
            this.config.set(
                "librarynamespaceURI",
                this.config
                    .get("librarynamespace")
                    .split(".")
                    .join("/")
            );
            this.config.set(
                "librarybasepath",
                this.config
                    .get("librarynamespace")
                    .split(".")
                    .map(_ => "..")
                    .join("/") + "/"
            );
            this.config.set("frameworklowercase", props.framework.toLowerCase());
        });
    }

    writing() {
        const oConfig = this.config.getAll();

        this.sourceRoot(path.join(__dirname, "templates"));
        glob
            .sync("**", {
                cwd: this.sourceRoot(),
                nodir: true
            })
            .forEach(file => {
                const sOrigin = this.templatePath(file);
                let sTarget = this.destinationPath(
                    file
                        .replace(/^_/, "")
                        .replace("baselibrary", oConfig.librarynamespaceURI)
                        .replace(/\/_/, "/")
                );

                this.fs.copyTpl(sOrigin, sTarget, oConfig);
            });
    }

    install() {
        this.config.set("setupCompleted", true);
        this.installDependencies({
            bower: false,
            npm: true
        });
    }

    end() {
        this.spawnCommandSync("git", ["init", "--quiet"], {
            cwd: this.destinationPath()
        });
        this.spawnCommandSync("git", ["add", "."], {
            cwd: this.destinationPath()
        });
        this.spawnCommandSync(
            "git",
            [
                "commit",
                "--quiet",
                "--allow-empty",
                "-m",
                "Initialize repository with UI5 Library Generator"
            ],
            {
                cwd: this.destinationPath()
            }
        );
    }
};
